// DexVault plugin for Navidrome: hands DexVault, as they are, everything
// Navidrome tells a scrobbler about every account (each play, what starts
// playing, each playback report), and every hour each account's library as
// that account sees it (its plays, stars and hearts). It decides nothing:
// DexVault keeps it all and makes of it what it counts.
//
// Build with ./build.sh, which makes dexvault.ndp.
package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/navidrome/navidrome/plugins/pdk/go/host"
	"github.com/navidrome/navidrome/plugins/pdk/go/lifecycle"
	"github.com/navidrome/navidrome/plugins/pdk/go/pdk"
	"github.com/navidrome/navidrome/plugins/pdk/go/scheduler"
	"github.com/navidrome/navidrome/plugins/pdk/go/scrobbler"
)

const (
	defaultURL = "http://dexvault:3001"
	// The libraries: on the hour, and once soon after Navidrome starts.
	librarySchedule   = "library"
	libraryEvery      = "@every 1h"
	libraryFirst      = "library-first"
	firstDelaySeconds = 60
	pageSize          = 500
	timeoutMs         = 30000
)

type dexvaultPlugin struct{}

func init() {
	plugin := &dexvaultPlugin{}
	scrobbler.Register(plugin)
	scheduler.Register(plugin)
	lifecycle.Register(plugin)
}

func main() {}

func config(key, fallback string) string {
	if value, ok := pdk.GetConfig(key); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

// send hands DexVault what Navidrome said. A failure asks Navidrome to try
// again later: it keeps the plays it could not deliver and sends them once
// DexVault answers.
func send(method, path string, body any) error {
	token := config("token", "")
	if token == "" {
		pdk.Log(pdk.LogWarn, "DexVault plugin: no token set in the plugin's settings")
		return scrobbler.ScrobblerErrorRetryLater
	}
	data, err := json.Marshal(body)
	if err != nil {
		return scrobbler.ScrobblerErrorUnrecoverable
	}
	res, err := host.HTTPSend(host.HTTPRequest{
		Method:    method,
		URL:       strings.TrimRight(config("url", defaultURL), "/") + path,
		Headers:   map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + token},
		Body:      data,
		TimeoutMs: timeoutMs,
	})
	if err != nil {
		pdk.Log(pdk.LogWarn, "DexVault plugin: DexVault unreachable: "+err.Error())
		return scrobbler.ScrobblerErrorRetryLater
	}
	switch {
	case res.StatusCode >= 200 && res.StatusCode < 300:
		return nil
	case res.StatusCode == 400:
		// DexVault will never take it: no use keeping it.
		pdk.Log(pdk.LogError, fmt.Sprintf("DexVault plugin: DexVault refused %s: %s", path, string(res.Body)))
		return scrobbler.ScrobblerErrorUnrecoverable
	default:
		// A wrong token, DexVault starting or failing: kept for later, nothing lost.
		pdk.Log(pdk.LogWarn, fmt.Sprintf("DexVault plugin: DexVault answered %d to %s: %s", res.StatusCode, path, string(res.Body)))
		return scrobbler.ScrobblerErrorRetryLater
	}
}

// event is what Navidrome told the plugin, untouched, and which call it came by.
type event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

const eventsPath = "/api/music/navidrome/plugin/events"

// Every account assigned to the plugin in Navidrome is reported.
func (p *dexvaultPlugin) IsAuthorized(scrobbler.IsAuthorizedRequest) (bool, error) {
	return true, nil
}

// A play Navidrome counts. Kept by Navidrome until DexVault has it.
func (p *dexvaultPlugin) Scrobble(req scrobbler.ScrobbleRequest) error {
	return send("POST", eventsPath, event{Type: "scrobble", Data: req})
}

// A track starting. Navidrome does not keep these: one missed is gone.
func (p *dexvaultPlugin) NowPlaying(req scrobbler.NowPlayingRequest) error {
	if err := send("POST", eventsPath, event{Type: "nowPlaying", Data: req}); err != nil {
		pdk.Log(pdk.LogDebug, "DexVault plugin: now playing not sent")
	}
	return nil
}

// Play, pause, stop and position, from players that report them. Not kept either.
func (p *dexvaultPlugin) PlaybackReport(req scrobbler.PlaybackReportRequest) error {
	if err := send("POST", eventsPath, event{Type: "playbackReport", Data: req}); err != nil {
		pdk.Log(pdk.LogDebug, "DexVault plugin: playback report not sent")
	}
	return nil
}

func (p *dexvaultPlugin) OnInit() error {
	if _, err := host.SchedulerScheduleRecurring(libraryEvery, "", librarySchedule); err != nil {
		pdk.Log(pdk.LogError, "DexVault plugin: could not schedule the hourly report: "+err.Error())
	}
	if _, err := host.SchedulerScheduleOneTime(firstDelaySeconds, "", libraryFirst); err != nil {
		pdk.Log(pdk.LogWarn, "DexVault plugin: could not schedule the first report: "+err.Error())
	}
	return nil
}

func (p *dexvaultPlugin) OnCallback(scheduler.SchedulerCallbackRequest) error {
	users, err := host.UsersGetUsers()
	if err != nil {
		pdk.Log(pdk.LogError, "DexVault plugin: could not list the accounts: "+err.Error())
		return nil
	}
	for _, user := range users {
		if err := reportLibrary(user); err != nil {
			pdk.Log(pdk.LogWarn, fmt.Sprintf("DexVault plugin: library of %s not reported: %s", user.UserName, err.Error()))
		}
	}
	return nil
}

// ask calls Navidrome's Subsonic API from inside, as the account, and returns
// the part of the answer under `key`, untouched.
func ask(user, endpoint, key string, params url.Values) (json.RawMessage, error) {
	params.Set("u", user)
	params.Set("v", "1.16.1")
	params.Set("c", "dexvault-plugin")
	params.Set("f", "json")
	raw, err := host.SubsonicAPICall("/rest/" + endpoint + "?" + params.Encode())
	if err != nil {
		return nil, err
	}
	var answer struct {
		Response map[string]json.RawMessage `json:"subsonic-response"`
	}
	if err := json.Unmarshal([]byte(raw), &answer); err != nil {
		return nil, err
	}
	var status string
	_ = json.Unmarshal(answer.Response["status"], &status)
	if status != "ok" {
		return nil, fmt.Errorf("Navidrome answered %s", string(answer.Response["error"]))
	}
	return answer.Response[key], nil
}

// pages reads a paged list to its end: each item as Navidrome gives it.
func pages(user, endpoint, key, field string, params func(offset int) url.Values) ([]json.RawMessage, error) {
	all := []json.RawMessage{}
	for offset := 0; ; offset += pageSize {
		part, err := ask(user, endpoint, key, params(offset))
		if err != nil {
			return nil, err
		}
		var page map[string][]json.RawMessage
		if len(part) > 0 {
			if err := json.Unmarshal(part, &page); err != nil {
				return nil, err
			}
		}
		all = append(all, page[field]...)
		if len(page[field]) < pageSize {
			return all, nil
		}
	}
}

// reportLibrary reads every song, album and artist as the account sees them
// (its plays, stars and hearts) and sends them all, as Navidrome gives them.
func reportLibrary(user host.User) error {
	songs, err := pages(user.UserName, "search3", "searchResult3", "song", func(offset int) url.Values {
		return url.Values{"query": {""}, "songCount": {fmt.Sprint(pageSize)}, "songOffset": {fmt.Sprint(offset)}, "albumCount": {"0"}, "artistCount": {"0"}}
	})
	if err != nil {
		return err
	}
	albums, err := pages(user.UserName, "getAlbumList2", "albumList2", "album", func(offset int) url.Values {
		return url.Values{"type": {"alphabeticalByName"}, "size": {fmt.Sprint(pageSize)}, "offset": {fmt.Sprint(offset)}}
	})
	if err != nil {
		return err
	}
	artists, err := pages(user.UserName, "search3", "searchResult3", "artist", func(offset int) url.Values {
		return url.Values{"query": {""}, "artistCount": {fmt.Sprint(pageSize)}, "artistOffset": {fmt.Sprint(offset)}, "albumCount": {"0"}, "songCount": {"0"}}
	})
	if err != nil {
		return err
	}
	body := map[string]any{"user": user, "songs": songs, "albums": albums, "artists": artists}
	if err := send("PUT", "/api/music/navidrome/plugin/library/"+url.PathEscape(user.UserName), body); err != nil {
		return err
	}
	pdk.Log(pdk.LogInfo, fmt.Sprintf("DexVault plugin: library of %s reported, %d songs, %d albums, %d artists", user.UserName, len(songs), len(albums), len(artists)))
	return nil
}
