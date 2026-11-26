package handlers

import (
	"net/http"
	"strings"

	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"
	"exam-manager/backend/pkg/services"

	"gorm.io/gorm"
)

type SchedulingHandler struct {
	DB *gorm.DB
}

// ── Rooms CRUD ───────────────────────────────────────────────────────────────

func (h *SchedulingHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	var rooms []db.Room
	if err := h.DB.Order("name ASC").Find(&rooms).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(rooms))
	for _, rm := range rooms {
		out = append(out, map[string]any{
			"id":        rm.ID,
			"name":      rm.Name,
			"room_type": rm.RoomType,
			"is_active": rm.IsActive,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *SchedulingHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		RoomType string `json:"room_type"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "اسم القاعة مطلوب")
		return
	}
	rt := body.RoomType
	if rt != "standard" && rt != "computer" && rt != "yard" && rt != "multipurpose" {
		rt = "standard"
	}
	var count int64
	h.DB.Model(&db.Room{}).Where("name = ?", name).Count(&count)
	if count > 0 {
		httpx.WriteError(w, http.StatusConflict, "القاعة موجودة مسبقاً")
		return
	}
	rm := db.Room{Name: name, RoomType: rt, IsActive: true}
	if err := h.DB.Create(&rm).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id": rm.ID, "name": rm.Name, "room_type": rm.RoomType, "is_active": rm.IsActive,
	})
}

func (h *SchedulingHandler) DeleteRoom(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("room_id")
	if err := h.DB.Delete(&db.Room{}, "id = ?", id).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Level Curriculum CRUD ────────────────────────────────────────────────────

func (h *SchedulingHandler) ListCurriculum(w http.ResponseWriter, r *http.Request) {
	var rows []db.LevelCurriculum
	if err := h.DB.Preload("Subject").Find(&rows).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, c := range rows {
		sName, sCode := "", ""
		if c.Subject != nil {
			sName, sCode = c.Subject.NameAr, c.Subject.Code
		}
		out = append(out, map[string]any{
			"id":               c.ID,
			"level":            c.Level,
			"subject_id":       c.SubjectID,
			"subject_code":     sCode,
			"subject_name":     sName,
			"weekly_hours":     c.WeeklyHours,
			"block_size":       c.BlockSize,
			"cognitive_weight": c.CognitiveWeight,
			"room_type":        c.RoomType,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *SchedulingHandler) UpsertCurriculum(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Items []struct {
			Level           string  `json:"level"`
			SubjectID       string  `json:"subject_id"`
			WeeklyHours     float64 `json:"weekly_hours"`
			BlockSize       float64 `json:"block_size"`
			CognitiveWeight string  `json:"cognitive_weight"`
			RoomType        string  `json:"room_type"`
		} `json:"items"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		for _, it := range body.Items {
			lvl := strings.TrimSpace(it.Level)
			if lvl == "" || it.SubjectID == "" {
				continue
			}
			if it.WeeklyHours <= 0 {
				if err := tx.Where("level = ? AND subject_id = ?", lvl, it.SubjectID).Delete(&db.LevelCurriculum{}).Error; err != nil {
					return err
				}
				continue
			}
			blk := it.BlockSize
			if blk < 1 {
				blk = 1
			}
			cw := it.CognitiveWeight
			if cw != "heavy" && cw != "light" {
				cw = "heavy"
			}
			rt := it.RoomType
			if rt == "" {
				rt = "standard"
			}
			var existing db.LevelCurriculum
			if err := tx.Where("level = ? AND subject_id = ?", lvl, it.SubjectID).First(&existing).Error; err == nil {
				existing.WeeklyHours = it.WeeklyHours
				existing.BlockSize = blk
				existing.CognitiveWeight = cw
				existing.RoomType = rt
				if err := tx.Save(&existing).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Create(&db.LevelCurriculum{
					Level:           lvl,
					SubjectID:       it.SubjectID,
					WeeklyHours:     it.WeeklyHours,
					BlockSize:       blk,
					CognitiveWeight: cw,
					RoomType:        rt,
				}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Timetable Auto-Generate & Commit ─────────────────────────────────────────

func (h *SchedulingHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var cfg services.ScheduleConfig
	_ = httpx.DecodeJSON(r, &cfg)

	var assignments []db.TeacherAssignment
	if err := h.DB.Preload("Teacher").Preload("Class").Preload("Subject").Find(&assignments).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var curricula []db.LevelCurriculum
	h.DB.Find(&curricula)
	var rooms []db.Room
	h.DB.Where("is_active = ?", true).Order("name ASC").Find(&rooms)
	var pinned []db.TimetableSlot
	h.DB.Preload("Teacher").Preload("Class").Preload("Subject").Where("is_pinned = ?", true).Find(&pinned)

	res := services.GenerateTimetable(cfg, assignments, curricula, rooms, pinned)
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *SchedulingHandler) Commit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Slots []services.GeneratedSlot `json:"slots"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		// Keep pinned slots untouched; replace all unlocked slots
		if err := tx.Where("is_pinned = ?", false).Delete(&db.TimetableSlot{}).Error; err != nil {
			return err
		}
		for _, s := range body.Slots {
			if s.IsPinned {
				continue
			}
			slot := db.TimetableSlot{
				TeacherID: s.TeacherID,
				ClassID:   s.ClassID,
				SubjectID: s.SubjectID,
				Day:       s.Day,
				Start:     s.Start,
				End:       s.End,
				Room:      s.Room,
				Label:     s.Label,
				IsPinned:  false,
			}
			if err := tx.Create(&slot).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *SchedulingHandler) TogglePin(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("slot_id")
	var s db.TimetableSlot
	if err := h.DB.Where("id = ?", id).First(&s).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Slot not found")
		return
	}
	s.IsPinned = !s.IsPinned
	if err := h.DB.Model(&db.TimetableSlot{}).Where("id = ?", s.ID).Update("is_pinned", s.IsPinned).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "is_pinned": s.IsPinned})
}
