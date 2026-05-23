package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const uploadDir = "./uploads"
const maxUploadSize = 10 << 20 // 10 MB

func UploadHandler(w http.ResponseWriter, r *http.Request) {
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		jsonError(w, "upload dir error", http.StatusInternalServerError)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		jsonError(w, "file too large (max 10MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "missing file field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".pdf": true, ".txt": true}
	if !allowed[ext] {
		jsonError(w, "file type not allowed", http.StatusBadRequest)
		return
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	dst, err := os.Create(filepath.Join(uploadDir, filename))
	if err != nil {
		jsonError(w, "error saving file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		jsonError(w, "error writing file", http.StatusInternalServerError)
		return
	}

	fileType := "file"
	imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
	if imageExts[ext] {
		fileType = "image"
	}

	publicURL := os.Getenv("PUBLIC_URL")
	jsonResponse(w, map[string]string{
		"url":       publicURL + "/uploads/" + filename,
		"file_type": fileType,
		"name":      header.Filename,
	}, http.StatusOK)
}
