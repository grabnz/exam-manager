package app

import (
	"fmt"
	"log"
	"net/http"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/handlers"
	"exam-manager/backend/internal/httpx"
)

// New initializes the database, runs migrations and admin bootstrap, and returns
// the root http.Handler ready for both standalone and serverless execution.
func New() (http.Handler, error) {
	conn, err := db.Open()
	if err != nil {
		return nil, fmt.Errorf("init db: %w", err)
	}
	if err := db.Migrate(conn); err != nil {
		log.Printf("[startup] migration warning: %v", err)
	}
	if err := db.BootstrapAdmin(conn, auth.HashPassword); err != nil {
		log.Printf("[startup] admin bootstrap warning: %v", err)
	}

	authH := &handlers.AuthHandler{DB: conn}
	usersH := &handlers.UsersHandler{DB: conn}
	subjectsH := &handlers.SubjectsHandler{DB: conn}
	templatesH := &handlers.TemplatesHandler{DB: conn}
	assignmentsH := &handlers.AssignmentsHandler{DB: conn}
	settingsH := &handlers.SettingsHandler{DB: conn}
	statsH := &handlers.StatsHandler{DB: conn}
	calendarH := &handlers.CalendarHandler{DB: conn}
	docsH := &handlers.DocumentsHandler{DB: conn}
	timetableH := &handlers.TimetableHandler{DB: conn}
	classesH := &handlers.ClassesHandler{DB: conn}
	sessionsH := &handlers.SessionsHandler{DB: conn}
	scoresH := &handlers.ScoresHandler{DB: conn}
	profileH := &handlers.ProfileHandler{DB: conn}

	requireUser := func(fn http.HandlerFunc) http.HandlerFunc {
		return auth.RequireAuth(conn, fn)
	}
	requireAdmin := func(fn http.HandlerFunc) http.HandlerFunc {
		return auth.RequireAdmin(conn, fn)
	}

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Auth
	mux.HandleFunc("POST /api/auth/login", authH.Login)
	mux.HandleFunc("GET /api/auth/me", requireUser(authH.Me))
	mux.HandleFunc("POST /api/auth/change-password", requireUser(authH.ChangePassword))

	// Users (admin)
	mux.HandleFunc("GET /api/users", requireAdmin(usersH.List))
	mux.HandleFunc("POST /api/users", requireAdmin(usersH.Create))
	mux.HandleFunc("POST /api/users/bulk", requireAdmin(usersH.BulkCreate))
	mux.HandleFunc("PATCH /api/users/{user_id}", requireAdmin(usersH.Update))
	mux.HandleFunc("POST /api/users/{user_id}/reset-password", requireAdmin(usersH.ResetPassword))
	mux.HandleFunc("DELETE /api/users/{user_id}", requireAdmin(usersH.Delete))

	// Subjects
	mux.HandleFunc("GET /api/subjects", requireUser(subjectsH.List))

	// Templates
	mux.HandleFunc("GET /api/subjects/{subject_id}/templates", requireUser(templatesH.ListForSubject))
	mux.HandleFunc("POST /api/subjects/{subject_id}/templates", requireAdmin(templatesH.Create))
	mux.HandleFunc("GET /api/templates/{template_id}", requireUser(templatesH.Get))
	mux.HandleFunc("POST /api/templates/{template_id}/clone", requireAdmin(templatesH.Clone))
	mux.HandleFunc("PUT /api/templates/{template_id}", requireAdmin(templatesH.Update))
	mux.HandleFunc("DELETE /api/templates/{template_id}", requireAdmin(templatesH.Delete))

	// Assignments
	mux.HandleFunc("GET /api/assignments", requireUser(assignmentsH.List))
	mux.HandleFunc("POST /api/assignments", requireAdmin(assignmentsH.Create))
	mux.HandleFunc("DELETE /api/assignments/{assignment_id}", requireAdmin(assignmentsH.Delete))

	// Settings
	mux.HandleFunc("GET /api/settings", requireUser(settingsH.Get))
	mux.HandleFunc("PUT /api/settings", requireAdmin(settingsH.Update))

	// Stats
	mux.HandleFunc("GET /api/stats", requireUser(statsH.Get))

	// Calendar events
	mux.HandleFunc("GET /api/events", requireUser(calendarH.List))
	mux.HandleFunc("POST /api/events", requireUser(calendarH.Create))
	mux.HandleFunc("DELETE /api/events/{event_id}", requireUser(calendarH.Delete))

	// Official documents
	mux.HandleFunc("GET /api/documents", requireUser(docsH.List))
	mux.HandleFunc("POST /api/documents", requireAdmin(docsH.Upload))
	mux.HandleFunc("GET /api/documents/{doc_id}/download", requireUser(docsH.Download))
	mux.HandleFunc("DELETE /api/documents/{doc_id}", requireAdmin(docsH.Delete))

	// Timetable
	mux.HandleFunc("GET /api/timetable", requireUser(timetableH.List))
	mux.HandleFunc("POST /api/timetable", requireAdmin(timetableH.Create))
	mux.HandleFunc("DELETE /api/timetable/{slot_id}", requireAdmin(timetableH.Delete))

	// Classes & students
	mux.HandleFunc("POST /api/classes/parse-pdf", requireAdmin(classesH.ParsePDFPreview))
	mux.HandleFunc("POST /api/classes/upload", requireAdmin(classesH.UploadPDF))
	mux.HandleFunc("POST /api/classes", requireAdmin(classesH.Create))
	mux.HandleFunc("GET /api/classes", requireUser(classesH.List))
	mux.HandleFunc("GET /api/classes/{class_id}", requireUser(classesH.Get))
	mux.HandleFunc("GET /api/classes/{class_id}/synthesis", requireUser(classesH.Synthesis))
	mux.HandleFunc("POST /api/classes/{class_id}/clone", requireAdmin(classesH.CloneClass))
	mux.HandleFunc("PATCH /api/classes/{class_id}", requireAdmin(classesH.Update))
	mux.HandleFunc("DELETE /api/classes/{class_id}", requireAdmin(classesH.Delete))
	mux.HandleFunc("POST /api/classes/{class_id}/students", requireAdmin(classesH.AddStudent))
	mux.HandleFunc("POST /api/classes/{class_id}/students/bulk", requireAdmin(classesH.BulkAddStudents))
	mux.HandleFunc("PATCH /api/classes/{class_id}/students/reorder", requireAdmin(classesH.ReorderStudents))
	mux.HandleFunc("PATCH /api/students/{student_id}", requireAdmin(classesH.RenameStudent))
	mux.HandleFunc("POST /api/students/{student_id}/transfer", requireAdmin(classesH.TransferStudent))
	mux.HandleFunc("DELETE /api/students/{student_id}", requireAdmin(classesH.DeleteStudent))

	// Sessions
	mux.HandleFunc("POST /api/classes/{class_id}/sessions", requireUser(sessionsH.Create))
	mux.HandleFunc("GET /api/sessions/{session_id}", requireUser(sessionsH.Get))
	mux.HandleFunc("PATCH /api/sessions/{session_id}/finalize", requireUser(sessionsH.Finalize))
	mux.HandleFunc("DELETE /api/sessions/{session_id}", requireUser(sessionsH.Delete))

	// Scores & Excel export
	mux.HandleFunc("GET /api/sessions/{session_id}/scores", requireUser(scoresH.Get))
	mux.HandleFunc("PUT /api/sessions/{session_id}/scores", requireUser(scoresH.Save))
	mux.HandleFunc("GET /api/sessions/{session_id}/export", requireUser(scoresH.ExportExcel))

	// Profile
	mux.HandleFunc("GET /api/profile", requireUser(profileH.Get))
	mux.HandleFunc("PUT /api/profile", requireUser(profileH.Update))

	return httpx.CORS(mux), nil
}
