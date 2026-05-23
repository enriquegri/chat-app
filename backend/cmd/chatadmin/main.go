package main

import (
	"database/sql"
	"fmt"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

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
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`chatadmin — ChatApp administration tool

Commands:
  create-user  --username NAME --email EMAIL --password PASS [--admin]
  reset-password --email EMAIL --password NEWPASS
  clear-chats  [--channel NAME | --all]`)
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

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fatal("hashing password: %v", err)
	}

	role := "user"
	if isAdmin {
		role = "admin"
	}

	_, err = db.Exec(
		`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
		username, email, string(hash), role,
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

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fatal("hashing password: %v", err)
	}

	res, err := db.Exec(`UPDATE users SET password_hash = ? WHERE email = ?`, string(hash), email)
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
