package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"io"
)

type Crypto struct {
	key []byte
}

func NewCrypto(key []byte) *Crypto {
	return &Crypto{key: key}
}

// Encrypt encrypts plaintext with AES-256-GCM (random nonce).
// Returns base64(nonce || ciphertext || tag).
func (c *Crypto) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(plaintext), nil)), nil
}

// Decrypt decrypts a value produced by Encrypt.
// If the value cannot be decrypted (legacy plaintext, wrong key) it is returned as-is.
func (c *Crypto) Decrypt(encoded string) string {
	if encoded == "" {
		return ""
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return encoded
	}
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return encoded
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return encoded
	}
	if len(data) < gcm.NonceSize() {
		return encoded
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return encoded
	}
	return string(plain)
}

// HMAC returns a deterministic HMAC-SHA256 of value for use as a DB lookup index.
func (c *Crypto) HMAC(value string) string {
	h := hmac.New(sha256.New, c.key)
	h.Write([]byte(value))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}
