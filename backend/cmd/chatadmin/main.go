package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

// --- inline crypto (mirrors services/crypto.go) ---

func cryptoKey() []byte {
	s := getEnv("ENCRYPTION_KEY", "")
	if s == "" {
		fatal("ENCRYPTION_KEY is required")
	}
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 32 {
		fatal("ENCRYPTION_KEY must be a 64-character hex string")
	}
	return b
}

func encrypt(key []byte, plaintext string) string {
	if plaintext == "" {
		return ""
	}
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	io.ReadFull(rand.Reader, nonce)
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(plaintext), nil))
}

func hmacVal(key []byte, value string) string {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(value))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	db := connect()
	defer db.Close()

	switch os.Args[1] {
	case "create-user":
		cmdCreateUser(db, os.Args[2:])
	case "reset-password":
		cmdResetPassword(db, os.Args[2:])
	case "clear-chats":
		cmdClearChats(db, os.Args[2:])
	case "encrypt-migrate":
		cmdEncryptMigrate(db)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`chatadmin — ChatApp administration tool

Commands:
  create-user     --username NAME --email EMAIL --password PASS [--admin]
  reset-password  --email EMAIL --password NEWPASS
  clear-chats     [--channel NAME | --all]
  encrypt-migrate  encrypt all existing plaintext data in the DB`)
}

func connect() *sql.DB {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		getEnv("DB_USER", "chatapp"),
		getEnv("DB_PASSWORD", "chatapppass"),
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "3306"),
		getEnv("DB_NAME", "chatapp"),
	)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		fatal("connecting to database: %v", err)
	}
	if err := db.Ping(); err != nil {
		fatal("pinging database: %v", err)
	}
	return db
}

func cmdCreateUser(db *sql.DB, args []string) {
	var username, email, password string
	isAdmin := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--username":
			username = next(args, i)
			i++
		case "--email":
			email = next(args, i)
			i++
		case "--password":
			password = next(args, i)
			i++
		case "--admin":
			isAdmin = true
		}
	}

	if username == "" || email == "" || password == "" {
		fatal("usage: create-user --username NAME --email EMAIL --password PASS [--admin]")
	}
	if len(password) < 8 {
		fatal("password must be at least 8 characters")
	}

	key := cryptoKey()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fatal("hashing password: %v", err)
	}

	role := "user"
	if isAdmin {
		role = "admin"
	}

	_, err = db.Exec(
		`INSERT INTO users (username, email, email_hash, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
		username, encrypt(key, email), hmacVal(key, email), string(hash), role,
	)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate") {
			fatal("user with that username or email already exists")
		}
		fatal("inserting user: %v", err)
	}

	fmt.Printf("user %q created (role: %s)\n", username, role)
}

func cmdResetPassword(db *sql.DB, args []string) {
	var email, password string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--email":
			email = next(args, i)
			i++
		case "--password":
			password = next(args, i)
			i++
		}
	}

	if email == "" || password == "" {
		fatal("usage: reset-password --email EMAIL --password NEWPASS")
	}
	if len(password) < 8 {
		fatal("password must be at least 8 characters")
	}

	key := cryptoKey()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fatal("hashing password: %v", err)
	}

	res, err := db.Exec(`UPDATE users SET password_hash = ? WHERE email_hash = ?`, string(hash), hmacVal(key, email))
	if err != nil {
		fatal("updating password: %v", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		fatal("no user found with email %q", email)
	}

	fmt.Printf("password reset for %q\n", email)
}

func cmdClearChats(db *sql.DB, args []string) {
	var channel string
	all := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--channel":
			channel = next(args, i)
			i++
		case "--all":
			all = true
		}
	}

	if !all && channel == "" {
		fatal("usage: clear-chats [--channel NAME | --all]")
	}

	if all {
		fmt.Print("This will delete ALL messages and reactions. Type YES to confirm: ")
		var confirm string
		fmt.Scanln(&confirm)
		if confirm != "YES" {
			fmt.Println("aborted")
			return
		}
		db.Exec(`DELETE FROM reactions`)
		res, _ := db.Exec(`DELETE FROM messages`)
		n, _ := res.RowsAffected()
		fmt.Printf("deleted %d messages and all reactions\n", n)
		return
	}

	var channelID int
	err := db.QueryRow(`SELECT id FROM channels WHERE name = ?`, channel).Scan(&channelID)
	if err != nil {
		fatal("channel %q not found", channel)
	}

	fmt.Printf("Delete all messages in #%s? Type YES to confirm: ", channel)
	var confirm string
	fmt.Scanln(&confirm)
	if confirm != "YES" {
		fmt.Println("aborted")
		return
	}

	db.Exec(`DELETE r FROM reactions r JOIN messages m ON r.message_id = m.id WHERE m.channel_id = ?`, channelID)
	res, _ := db.Exec(`DELETE FROM messages WHERE channel_id = ?`, channelID)
	n, _ := res.RowsAffected()
	fmt.Printf("deleted %d messages from #%s\n", n, channel)
}

func cmdEncryptMigrate(db *sql.DB) {
	key := cryptoKey()
	fmt.Println("Encrypting existing user emails and bios...")

	rows, err := db.Query("SELECT id, email, bio FROM users WHERE email_hash IS NULL OR email_hash = ''")
	if err != nil {
		fatal("querying users: %v", err)
	}
	defer rows.Close()

	type row struct {
		id    int
		email string
		bio   string
	}
	var users []row
	for rows.Next() {
		var r row
		rows.Scan(&r.id, &r.email, &r.bio)
		users = append(users, r)
	}
	rows.Close()

	for _, u := range users {
		encEmail := encrypt(key, u.email)
		encBio := encrypt(key, u.bio)
		emailH := hmacVal(key, u.email)
		_, err := db.Exec(
			"UPDATE users SET email = ?, bio = ?, email_hash = ? WHERE id = ?",
			encEmail, encBio, emailH, u.id,
		)
		if err != nil {
			fatal("updating user %d: %v", u.id, err)
		}
		fmt.Printf("  encrypted user id=%d\n", u.id)
	}
	fmt.Printf("Done. %d users migrated.\n", len(users))
}

func next(args []string, i int) string {
	if i+1 >= len(args) {
		fatal("flag %s requires a value", args[i])
	}
	return args[i+1]
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "error: "+format+"\n", a...)
	os.Exit(1)
}
