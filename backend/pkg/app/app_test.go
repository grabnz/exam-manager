package app_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"exam-manager/backend/pkg/app"
)

func doReq(t *testing.T, h http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestEndToEndAPIParity(t *testing.T) {
	t.Setenv("DATABASE_URL", "sqlite:///:memory:")
	t.Setenv("SECRET_KEY", "test-secret")
	t.Setenv("ADMIN_USERNAME", "admin")
	t.Setenv("ADMIN_PASSWORD", "admin123")

	h, err := app.New()
	if err != nil {
		t.Fatalf("app.New: %v", err)
	}

	// 1. Health
	rec := doReq(t, h, "GET", "/health", "", nil)
	if rec.Code != 200 {
		t.Fatalf("health: got %d", rec.Code)
	}

	// 2. Login as bootstrapped admin
	rec = doReq(t, h, "POST", "/api/auth/login", "", map[string]string{
		"username": "admin", "password": "admin123",
	})
	if rec.Code != 200 {
		t.Fatalf("login: got %d: %s", rec.Code, rec.Body.String())
	}
	var loginRes struct {
		Token string         `json:"token"`
		User  map[string]any `json:"user"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginRes)
	if loginRes.Token == "" {
		t.Fatal("expected JWT token")
	}
	tok := loginRes.Token

	// 3. Subjects seeded (12)
	rec = doReq(t, h, "GET", "/api/subjects", tok, nil)
	if rec.Code != 200 {
		t.Fatalf("subjects: got %d", rec.Code)
	}
	var subjects []struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &subjects)
	if len(subjects) != 12 {
		t.Fatalf("expected 12 subjects, got %d", len(subjects))
	}
	var frenchID string
	for _, s := range subjects {
		if s.Code == "francais" {
			frenchID = s.ID
		}
	}
	if frenchID == "" {
		t.Fatal("francais subject missing")
	}

	// 4. Create teacher
	rec = doReq(t, h, "POST", "/api/users", tok, map[string]string{
		"username": "salma.m", "password": "password123", "full_name": "سلمى", "role": "teacher",
	})
	if rec.Code != 200 {
		t.Fatalf("create user: got %d: %s", rec.Code, rec.Body.String())
	}
	var teacher struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &teacher)

	// 5. Create class + add student + assign teacher
	rec = doReq(t, h, "POST", "/api/classes", tok, map[string]string{
		"name": "الخامسة أ", "school_year": "2025-2026", "level": "السنة الخامسة",
	})
	if rec.Code != 200 {
		t.Fatalf("create class: got %d: %s", rec.Code, rec.Body.String())
	}
	var cls struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &cls)

	rec = doReq(t, h, "POST", "/api/classes/"+cls.ID+"/students", tok, map[string]string{
		"full_name": "أحمد بن علي",
	})
	if rec.Code != 200 {
		t.Fatalf("add student: got %d: %s", rec.Code, rec.Body.String())
	}
	var student struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &student)

	rec = doReq(t, h, "POST", "/api/assignments", tok, map[string]any{
		"teacher_id": teacher.ID, "class_id": cls.ID, "subject_ids": []string{frenchID},
	})
	if rec.Code != 200 {
		t.Fatalf("assign: got %d: %s", rec.Code, rec.Body.String())
	}

	// 6. Create session & fetch template
	rec = doReq(t, h, "POST", "/api/classes/"+cls.ID+"/sessions", tok, map[string]any{
		"trimester": 1, "exam_type": "امتحان", "subject_id": frenchID,
	})
	if rec.Code != 200 {
		t.Fatalf("create session: got %d: %s", rec.Code, rec.Body.String())
	}
	var sess struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &sess)

	rec = doReq(t, h, "GET", "/api/sessions/"+sess.ID, tok, nil)
	if rec.Code != 200 {
		t.Fatalf("get session: got %d", rec.Code)
	}
	var sessInfo struct {
		TemplateID string `json:"template_id"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &sessInfo)

	rec = doReq(t, h, "GET", "/api/templates/"+sessInfo.TemplateID, tok, nil)
	if rec.Code != 200 {
		t.Fatalf("get template: got %d", rec.Code)
	}
	var tpl struct {
		Sections []struct {
			ID       string `json:"id"`
			Criteria []struct {
				ID string `json:"id"`
			} `json:"criteria"`
		} `json:"sections"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &tpl)
	if len(tpl.Sections) != 7 {
		t.Fatalf("expected 7 French sections, got %d", len(tpl.Sections))
	}

	// 7. Save scores & verify computed final_score
	critID := tpl.Sections[0].Criteria[0].ID
	rec = doReq(t, h, "PUT", "/api/sessions/"+sess.ID+"/scores", tok, map[string]any{
		"scores": []map[string]any{
			{
				"student_id": student.ID,
				"criteria":   map[string]float64{critID: 15},
				"sections":   map[string]any{},
			},
		},
	})
	if rec.Code != 200 {
		t.Fatalf("save scores: got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doReq(t, h, "GET", "/api/sessions/"+sess.ID+"/scores", tok, nil)
	if rec.Code != 200 {
		t.Fatalf("get scores: got %d", rec.Code)
	}
	var rows []struct {
		FinalScore *float64 `json:"final_score"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &rows)
	if len(rows) != 1 || rows[0].FinalScore == nil || *rows[0].FinalScore != 5 {
		t.Fatalf("expected final_score=5 (15/3 groups), got %+v", rows)
	}

	// 8. Export Excel
	rec = doReq(t, h, "GET", "/api/sessions/"+sess.ID+"/export", tok, nil)
	if rec.Code != 200 || len(rec.Body.Bytes()) < 100 || string(rec.Body.Bytes()[:2]) != "PK" {
		t.Fatalf("export excel failed: status=%d len=%d", rec.Code, len(rec.Body.Bytes()))
	}

	// 9. Director stats
	rec = doReq(t, h, "GET", "/api/stats", tok, nil)
	if rec.Code != 200 {
		t.Fatalf("stats: got %d: %s", rec.Code, rec.Body.String())
	}

	// 10. Bulk add students (#5) + explicit 0 & absent status (#3)
	rec = doReq(t, h, "POST", "/api/classes/"+cls.ID+"/students/bulk", tok, map[string]any{
		"names": []string{"مريم الطرابلسي", "يوسف المنصوري", "أحمد بن علي", "  "},
	})
	if rec.Code != 200 {
		t.Fatalf("bulk students: got %d: %s", rec.Code, rec.Body.String())
	}
	var added []struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &added)
	if len(added) != 2 {
		t.Fatalf("expected 2 unique new students, got %d", len(added))
	}
	rec = doReq(t, h, "PUT", "/api/sessions/"+sess.ID+"/scores", tok, map[string]any{
		"scores": []map[string]any{
			{"student_id": added[0].ID, "criteria": map[string]float64{critID: 0}, "sections": map[string]any{}, "status": "present"},
			{"student_id": added[1].ID, "criteria": map[string]float64{critID: 15}, "sections": map[string]any{}, "status": "absent"},
		},
	})
	if rec.Code != 200 {
		t.Fatalf("save 0/absent: got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, "GET", "/api/sessions/"+sess.ID+"/scores", tok, nil)
	var rows2 []struct {
		StudentID  string   `json:"student_id"`
		Status     string   `json:"status"`
		FinalScore *float64 `json:"final_score"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &rows2)
	for _, r := range rows2 {
		if r.StudentID == added[0].ID && (r.FinalScore == nil || *r.FinalScore != 0) {
			t.Fatalf("expected explicit 0 final_score for student 0, got %+v", r)
		}
		if r.StudentID == added[1].ID && (r.FinalScore != nil || r.Status != "absent") {
			t.Fatalf("expected nil final_score and absent status, got %+v", r)
		}
	}

	// 11. Clone class (#8), Reorder & Transfer student (#17), Bulk users (#17), Synthesis (#16)
	rec = doReq(t, h, "POST", "/api/classes/"+cls.ID+"/clone", tok, map[string]any{
		"name": "السادسة أ", "school_year": "2026-2027", "level": "السنة السادسة", "copy_students": true,
	})
	if rec.Code != 200 {
		t.Fatalf("clone class: got %d: %s", rec.Code, rec.Body.String())
	}
	var cloned struct {
		ID           string `json:"id"`
		StudentCount int    `json:"student_count"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &cloned)
	if cloned.StudentCount != 3 {
		t.Fatalf("expected 3 cloned students, got %d", cloned.StudentCount)
	}

	rec = doReq(t, h, "PATCH", "/api/classes/"+cls.ID+"/students/reorder", tok, map[string]any{
		"student_ids": []string{added[1].ID, added[0].ID, student.ID},
	})
	if rec.Code != 200 {
		t.Fatalf("reorder students: got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doReq(t, h, "POST", "/api/students/"+added[1].ID+"/transfer", tok, map[string]any{
		"target_class_id": cloned.ID,
	})
	if rec.Code != 200 {
		t.Fatalf("transfer student: got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doReq(t, h, "POST", "/api/users/bulk", tok, map[string]any{
		"users": []map[string]string{
			{"full_name": "معلم 1", "username": "t.one"},
			{"full_name": "معلم 2"},
		},
	})
	if rec.Code != 200 {
		t.Fatalf("bulk users: got %d: %s", rec.Code, rec.Body.String())
	}
	var bulkUsers []struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &bulkUsers)
	if len(bulkUsers) != 2 || bulkUsers[0].Password == "" {
		t.Fatalf("expected 2 bulk users with generated passwords, got %+v", bulkUsers)
	}

	rec = doReq(t, h, "GET", "/api/classes/"+cls.ID+"/synthesis?trimester=1", tok, nil)
	if rec.Code != 200 {
		t.Fatalf("synthesis: got %d: %s", rec.Code, rec.Body.String())
	}
	var synth struct {
		Students []struct {
			Average *float64 `json:"average"`
			Rank    *int     `json:"rank"`
		} `json:"students"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &synth)
	if len(synth.Students) != 2 || synth.Students[0].Rank == nil {
		t.Fatalf("expected 2 remaining students with ranks in synthesis, got %+v", synth)
	}

	// 12. Timetable overlap rejection (409)
	rec = doReq(t, h, "POST", "/api/timetable", tok, map[string]any{
		"teacher_id": teacher.ID, "class_id": cls.ID, "subject_id": frenchID,
		"day": 1, "start": "08:00", "end": "09:00", "room": "1",
	})
	if rec.Code != 200 {
		t.Fatalf("timetable create: got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, "POST", "/api/timetable", tok, map[string]any{
		"teacher_id": teacher.ID, "class_id": cls.ID, "subject_id": frenchID,
		"day": 1, "start": "08:30", "end": "09:30", "room": "2",
	})
	if rec.Code != 409 {
		t.Fatalf("expected 409 overlap, got %d", rec.Code)
	}

	// 13. Consecutive auto-saves with base_updated_at must NOT false-409
	rec = doReq(t, h, "PUT", "/api/sessions/"+sess.ID+"/scores", tok, map[string]any{
		"scores": []map[string]any{{"student_id": student.ID, "criteria": map[string]float64{critID: 12}, "sections": map[string]any{}}},
	})
	if rec.Code != 200 {
		t.Fatalf("save 1: got %d: %s", rec.Code, rec.Body.String())
	}
	var save1 struct{ SavedAt string `json:"saved_at"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &save1)
	rec = doReq(t, h, "PUT", "/api/sessions/"+sess.ID+"/scores", tok, map[string]any{
		"scores":          []map[string]any{{"student_id": student.ID, "criteria": map[string]float64{critID: 14}, "sections": map[string]any{}}},
		"base_updated_at": save1.SavedAt,
	})
	if rec.Code != 200 {
		t.Fatalf("consecutive auto-save should succeed (no false 409), got %d: %s", rec.Code, rec.Body.String())
	}

	// 14. Template clone -> update -> delete
	rec = doReq(t, h, "POST", "/api/templates/"+sessInfo.TemplateID+"/clone", tok, nil)
	if rec.Code != 200 {
		t.Fatalf("template clone: got %d: %s", rec.Code, rec.Body.String())
	}
	var clonedTpl struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &clonedTpl)
	rec = doReq(t, h, "PUT", "/api/templates/"+clonedTpl.ID, tok, map[string]any{
		"name": "Custom Grid", "final_formula": "sum_sections", "direction": "rtl",
		"sections": []map[string]any{{
			"group_label": "المجال", "label": "القسم",
			"criteria": []map[string]any{{"label": "مع1", "max_score": 5}},
		}},
	})
	if rec.Code != 200 {
		t.Fatalf("template update: got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, "DELETE", "/api/templates/"+clonedTpl.ID, tok, nil)
	if rec.Code != 200 {
		t.Fatalf("template delete: got %d: %s", rec.Code, rec.Body.String())
	}

	// 15. Calendar (with empty time ""), Settings, Profile
	rec = doReq(t, h, "POST", "/api/events", tok, map[string]any{
		"title": "مجلس القسم", "date": "2026-11-28", "time": "", "is_school_wide": true,
	})
	if rec.Code != 200 {
		t.Fatalf("calendar create: got %d: %s", rec.Code, rec.Body.String())
	}
	var ev struct{ ID string `json:"id"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &ev)
	if rec = doReq(t, h, "GET", "/api/events?start=2026-11-01&end=2026-11-30", tok, nil); rec.Code != 200 {
		t.Fatalf("calendar list: got %d", rec.Code)
	}
	if rec = doReq(t, h, "DELETE", "/api/events/"+ev.ID, tok, nil); rec.Code != 200 {
		t.Fatalf("calendar delete: got %d", rec.Code)
	}
	if rec = doReq(t, h, "PUT", "/api/settings", tok, map[string]string{"school_name": "المدرسة الابتدائية", "active_year": "2025-2026", "region": "تونس"}); rec.Code != 200 {
		t.Fatalf("settings put: got %d", rec.Code)
	}
	if rec = doReq(t, h, "PUT", "/api/profile", tok, map[string]string{"name": "المدير", "grade": "مدير", "subject": ""}); rec.Code != 200 {
		t.Fatalf("profile put: got %d", rec.Code)
	}

	// 16. Teacher authorization boundaries
	rec = doReq(t, h, "POST", "/api/auth/login", "", map[string]string{"username": "salma.m", "password": "password123"})
	if rec.Code != 200 {
		t.Fatalf("teacher login: got %d", rec.Code)
	}
	var tLogin struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &tLogin)
	if rec = doReq(t, h, "GET", "/api/users", tLogin.Token, nil); rec.Code != 403 {
		t.Fatalf("teacher should get 403 on /api/users, got %d", rec.Code)
	}
	if rec = doReq(t, h, "GET", "/api/classes/"+cloned.ID, tLogin.Token, nil); rec.Code != 404 {
		t.Fatalf("teacher should get 404 on unassigned class, got %d", rec.Code)
	}
	if rec = doReq(t, h, "GET", "/api/stats", tLogin.Token, nil); rec.Code != 200 {
		t.Fatalf("teacher stats: got %d", rec.Code)
	}

	// 17. Clean deletes (session -> student -> class -> user)
	if rec = doReq(t, h, "DELETE", "/api/sessions/"+sess.ID, tok, nil); rec.Code != 200 {
		t.Fatalf("delete session: got %d: %s", rec.Code, rec.Body.String())
	}
	if rec = doReq(t, h, "DELETE", "/api/students/"+student.ID, tok, nil); rec.Code != 200 {
		t.Fatalf("delete student: got %d: %s", rec.Code, rec.Body.String())
	}
	if rec = doReq(t, h, "DELETE", "/api/classes/"+cls.ID, tok, nil); rec.Code != 200 {
		t.Fatalf("delete class: got %d: %s", rec.Code, rec.Body.String())
	}
	if rec = doReq(t, h, "DELETE", "/api/users/"+teacher.ID, tok, nil); rec.Code != 200 {
		t.Fatalf("delete user: got %d: %s", rec.Code, rec.Body.String())
	}
}
