// DexVault plugin for Navidrome: tells DexVault what every Navidrome account
// plays, as it plays it, and each account's stars and hearts every hour.
// DexVault's own reading of Navidrome only sees NAVIDROME_USER: this is how
// the other accounts are counted too, with no password of theirs in DexVault.
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
	// Reports of stars and hearts: on the hour, and once soon after Navidrome starts.
	favouritesSchedule = "favourites"
	favouritesEvery    = "@every 1h"
	favouritesFirst    = "favourites-first"
	firstDelaySeconds  = 60
	pageSize           = 500
	timeoutMs          = 15000
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

// send hands DexVault a report. A failure asks Navidrome to try again later:
// it keeps the plays it could not deliver and sends them once DexVault answers.
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

// Every account assigned to the plugin in Navidrome is reported.
func (p *dexvaultPlugin) IsAuthorized(scrobbler.IsAuthorizedRequest) (bool, error) {
	return true, nil
}

// What is playing now: DexVault asks Navidrome itself when it wants it.
func (p *dexvaultPlugin) NowPlaying(scrobbler.NowPlayingRequest) error { return nil }

func (p *dexvaultPlugin) PlaybackReport(scrobbler.PlaybackReportRequest) error { return nil }

type listen struct {
	User     string `json:"user"`
	SongID   string `json:"songId"`
	PlayedAt int64  `json:"playedAt"`
}

// A play that counts, as Navidrome counts it: half the track or four minutes heard.
func (p *dexvaultPlugin) Scrobble(req scrobbler.ScrobbleRequest) error {
	if req.Track.ID == "" {
		return nil
	}
	return send("POST", "/api/music/navidrome/plugin/listens", listen{User: req.Username, SongID: req.Track.ID, PlayedAt: req.Timestamp})
}

func (p *dexvaultPlugin) OnInit() error {
	if _, err := host.SchedulerScheduleRecurring(favouritesEvery, "", favouritesSchedule); err != nil {
		pdk.Log(pdk.LogError, "DexVault plugin: could not schedule the hourly report: "+err.Error())
	}
	if _, err := host.SchedulerScheduleOneTime(firstDelaySeconds, "", favouritesFirst); err != nil {
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
		if err := reportFavourites(user.UserName); err != nil {
			pdk.Log(pdk.LogWarn, fmt.Sprintf("DexVault plugin: stars and hearts of %s not reported: %s", user.UserName, err.Error()))
		}
	}
	return nil
}

type favourite struct {
	ID      string `json:"id"`
	Rating  int    `json:"rating"`
	Starred bool   `json:"starred"`
}

// The part of Subsonic's answers the report needs.
type item struct {
	ID         string `json:"id"`
	UserRating int    `json:"userRating"`
	Starred    string `json:"starred"`
}

type subsonicAnswer struct {
	Response struct {
		Status string `json:"status"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
		SearchResult3 struct {
			Song []item `json:"song"`
		} `json:"searchResult3"`
		AlbumList2 struct {
			Album []item `json:"album"`
		} `json:"albumList2"`
	} `json:"subsonic-response"`
}

// ask calls Navidrome's Subsonic API from inside, as the account.
func ask(user, endpoint string, params url.Values) (*subsonicAnswer, error) {
	params.Set("u", user)
	params.Set("v", "1.16.1")
	params.Set("c", "dexvault-plugin")
	params.Set("f", "json")
	raw, err := host.SubsonicAPICall("/rest/" + endpoint + "?" + params.Encode())
	if err != nil {
		return nil, err
	}
	var answer subsonicAnswer
	if err := json.Unmarshal([]byte(raw), &answer); err != nil {
		return nil, err
	}
	if answer.Response.Status != "ok" {
		if answer.Response.Error != nil {
			return nil, fmt.Errorf("%s", answer.Response.Error.Message)
		}
		return nil, fmt.Errorf("Navidrome answered %q", answer.Response.Status)
	}
	return &answer, nil
}

func liked(items []item, into []favourite) []favourite {
	for _, it := range items {
		if it.UserRating > 0 || it.Starred != "" {
			into = append(into, favourite{ID: it.ID, Rating: it.UserRating, Starred: it.Starred != ""})
		}
	}
	return into
}

// reportFavourites reads every song and album as the account sees them and
// sends DexVault those it rated or hearted, which replace what it had.
func reportFavourites(user string) error {
	songs := []favourite{}
	for offset := 0; ; offset += pageSize {
		answer, err := ask(user, "search3", url.Values{
			"query": {""}, "songCount": {fmt.Sprint(pageSize)}, "songOffset": {fmt.Sprint(offset)},
			"albumCount": {"0"}, "artistCount": {"0"},
		})
		if err != nil {
			return err
		}
		page := answer.Response.SearchResult3.Song
		songs = liked(page, songs)
		if len(page) < pageSize {
			break
		}
	}
	albums := []favourite{}
	for offset := 0; ; offset += pageSize {
		answer, err := ask(user, "getAlbumList2", url.Values{
			"type": {"alphabeticalByName"}, "size": {fmt.Sprint(pageSize)}, "offset": {fmt.Sprint(offset)},
		})
		if err != nil {
			return err
		}
		page := answer.Response.AlbumList2.Album
		albums = liked(page, albums)
		if len(page) < pageSize {
			break
		}
	}
	if err := send("PUT", "/api/music/navidrome/plugin/favourites/"+url.PathEscape(user), map[string]any{"songs": songs, "albums": albums}); err != nil {
		return err
	}
	pdk.Log(pdk.LogInfo, fmt.Sprintf("DexVault plugin: %s's likes reported, %d songs and %d albums", user, len(songs), len(albums)))
	return nil
}
