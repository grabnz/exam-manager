package db

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open connects to PostgreSQL (if DATABASE_URL is set to postgres:// or postgresql://)
// or SQLite (default: ./exam_manager.db).
func Open() (*gorm.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "sqlite:///./exam_manager.db"
	}

	cfg := &gorm.Config{
		Logger: logger.New(
			log.New(os.Stdout, "\r\n", log.LstdFlags),
			logger.Config{
				SlowThreshold:             200 * time.Millisecond,
				LogLevel:                  logger.Warn,
				IgnoreRecordNotFoundError: true,
			},
		),
	}

	var dialector gorm.Dialector
	if strings.HasPrefix(dsn, "sqlite") {
		path := strings.TrimPrefix(dsn, "sqlite:///")
		path = strings.TrimPrefix(path, "sqlite://")
		if path == "" {
			path = "./exam_manager.db"
		}
		dialector = sqlite.Open(path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	} else {
		if strings.HasPrefix(dsn, "postgres://") {
			dsn = strings.Replace(dsn, "postgres://", "postgresql://", 1)
		}
		dialector = postgres.Open(dsn)
	}

	conn, err := gorm.Open(dialector, cfg)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	sqlDB, err := conn.DB()
	if err == nil {
		if !strings.HasPrefix(dsn, "sqlite") {
			sqlDB.SetMaxOpenConns(5)
			sqlDB.SetMaxIdleConns(2)
			sqlDB.SetConnMaxLifetime(30 * time.Minute)
		}
	}

	return conn, nil
}
