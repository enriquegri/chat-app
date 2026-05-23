package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	ogTitleRx       = buildOGRx("og:title")
	ogDescRx        = buildOGRx("og:description")
	ogImageRx       = buildOGRx("og:image")
	ogTitleRevRx    = buildOGRevRx("og:title")
	ogDescRevRx     = buildOGRevRx("og:description")
	ogImageRevRx    = buildOGRevRx("og:image")
	titleTagRx      = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
)

func buildOGRx(prop string) *regexp.Regexp {
	return regexp.MustCompile(`(?i)<meta[^>]+property=["']` + regexp.QuoteMeta(prop) + `["'][^>]+content=["']([^"']+)["']`)
}

func buildOGRevRx(prop string) *regexp.Regexp {
	return regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']` + regexp.QuoteMeta(prop) + `["']`)
}

func extractOG(body, prop string) string {
	var fwd, rev *regexp.Regexp
	switch prop {
	case "og:title":
		fwd, rev = ogTitleRx, ogTitleRevRx
	case "og:description":
		fwd, rev = ogDescRx, ogDescRevRx
	default:
		fwd, rev = ogImageRx, ogImageRevRx
	}
	if m := fwd.FindStringSubmatch(body); m != nil {
		return strings.TrimSpace(m[1])
	}
	if m := rev.FindStringSubmatch(body); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func extractHTMLTitle(body string) string {
	if m := titleTagRx.FindStringSubmatch(body); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// LinkPreviewHandler fetches OG metadata for a given URL.
// GET /api/link-preview?url=https://example.com
func LinkPreviewHandler(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		jsonError(w, "url required", http.StatusBadRequest)
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		jsonError(w, "invalid url", http.StatusBadRequest)
		return
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	req, _ := http.NewRequest("GET", rawURL, nil)
	req.Header.Set("User-Agent", "ChatApp/1.0 (link-preview bot)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		jsonError(w, "fetch failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Read at most 128 KB — enough for the <head> of any page
	limited := io.LimitReader(resp.Body, 128*1024)
	bodyBytes, _ := io.ReadAll(limited)
	body := string(bodyBytes)

	title := extractOG(body, "og:title")
	if title == "" {
		title = extractHTMLTitle(body)
	}
	description := extractOG(body, "og:description")
	image := extractOG(body, "og:image")

	// Make relative image URLs absolute
	if image != "" && !strings.HasPrefix(image, "http") {
		base := parsed.Scheme + "://" + parsed.Host
		if strings.HasPrefix(image, "/") {
			image = base + image
		} else {
			image = base + "/" + image
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url":         rawURL,
		"title":       title,
		"description": description,
		"image":       image,
	})
}
