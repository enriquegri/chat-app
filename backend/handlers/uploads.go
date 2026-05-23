package handlers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var magicBytes = map[string][]byte{
	".jpg":  {0xFF, 0xD8, 0xFF},
	".jpeg": {0xFF, 0xD8, 0xFF},
	".png":  {0x89, 0x50, 0x4E, 0x47},
	".gif":  {0x47, 0x49, 0x46, 0x38},
	".webp": {0x52, 0x49, 0x46, 0x46},
	".pdf":  {0x25, 0x50, 0x44, 0x46},
}

func matchesMagic(data []byte, ext string) bool {
	magic, ok := magicBytes[ext]
	if !ok {
		return true // .txt sin magic bytes definidos
	}
	return len(data) >= len(magic) && bytes.Equal(data[:len(magic)], magic)
}

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

	// validar magic bytes
	header512 := make([]byte, 512)
	n, _ := file.Read(header512)
	if !matchesMagic(header512[:n], ext) {
		jsonError(w, "file content does not match extension", http.StatusBadRequest)
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		jsonError(w, "error processing file", http.StatusInternalServerError)
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
