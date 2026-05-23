package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

type rateBucket struct {
	tokens   float64
	lastSeen time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*rateBucket
	rate     float64
	capacity float64
}

func NewRateLimiter(requestsPerMinute int) *RateLimiter {
	rl := &RateLimiter{
		buckets:  make(map[string]*rateBucket),
		rate:     float64(requestsPerMinute) / 60.0,
		capacity: float64(requestsPerMinute) / 6.0, // burst: 10s worth
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[ip]
	if !ok {
		b = &rateBucket{tokens: rl.capacity}
		rl.buckets[ip] = b
	}

	now := time.Now()
	b.tokens += now.Sub(b.lastSeen).Seconds() * rl.rate
	b.lastSeen = now
	if b.tokens > rl.capacity {
		b.tokens = rl.capacity
	}

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			ip = strings.SplitN(xff, ",", 2)[0]
		}
		if !rl.allow(strings.TrimSpace(ip)) {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (rl *RateLimiter) cleanup() {
	for range time.Tick(5 * time.Minute) {
		rl.mu.Lock()
		for ip, b := range rl.buckets {
			if time.Since(b.lastSeen) > 10*time.Minute {
				delete(rl.buckets, ip)
			}
		}
		rl.mu.Unlock()
	}
}
