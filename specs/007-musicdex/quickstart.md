# Quickstart for MusicDex Feature

This guide provides instructions on how to test the MusicDex feature.

## Prerequisites

- The application must be running.
- You need a tool for making API requests, such as `curl` or Postman.

## Steps

1.  **Search for a CD**:
    - Make a `GET` request to `/api/music/search?q={query}`, where `{query}` is the title of a CD.
    - Example: `curl "http://localhost:3001/api/music/search?q=Nevermind"`
    - The response should be a JSON array of search results.

2.  **Add a CD**:
    - From the search results, pick a `musicbrainz_release_id`.
    - Make a `POST` request to `/api/music/cds` with the following body:
      ```json
      {
        "musicbrainz_release_id": "..."
      }
      ```
    - The response should be the newly created CD object with a `201` status.

3.  **Get a CD**:
    - Use the `id` from the previous step.
    - Make a `GET` request to `/api/music/cds/{id}`.
    - The response should be the full CD object.

4.  **Update a CD**:
    - Use the `id` from the previous step.
    - Make a `PUT` request to `/api/music/cds/{id}` with the following body:
      ```json
      {
        "condition": "VG+",
        "purchase_notes": "Bought at a local record store."
      }
      ```
    - The response should be the updated CD object.

5.  **Delete a CD**:
    - Use the `id` from the previous step.
    - Make a `DELETE` request to `/api/music/cds/{id}`.
    - The response should be a `204 No Content` status.