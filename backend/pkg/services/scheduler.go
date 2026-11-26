package services

import (
	"fmt"
	"math"
	"sort"

	"exam-manager/backend/pkg/db"
)

// ScheduleConfig defines school operating hours and days (objective & fair — no personal day-off).
type ScheduleConfig struct {
	Days           []int    `json:"days"`            // default [1,2,3,4,5,6] (Mon..Sat)
	MorningSlots   []string `json:"morning_slots"`   // default ["08:00","09:00","10:00","11:00"]
	AfternoonSlots []string `json:"afternoon_slots"` // default ["13:00","14:00","15:00","16:00"]
}

type GeneratedSlot struct {
	TeacherID   string  `json:"teacher_id"`
	TeacherName string  `json:"teacher_name"`
	ClassID     *string `json:"class_id"`
	ClassName   *string `json:"class_name"`
	SubjectID   *string `json:"subject_id"`
	SubjectCode *string `json:"subject_code"`
	SubjectName *string `json:"subject_name"`
	Day         int     `json:"day"`
	Start       string  `json:"start"`
	End         string  `json:"end"`
	Room        string  `json:"room"`
	Label       string  `json:"label"`
	IsPinned    bool    `json:"is_pinned"`
}

type TeacherLoadStat struct {
	TeacherID      string  `json:"teacher_id"`
	TeacherName    string  `json:"teacher_name"`
	MaxWeeklyHours float64 `json:"max_weekly_hours"`
	AssignedHours  float64 `json:"assigned_hours"`
	ScheduledHours float64 `json:"scheduled_hours"`
	GapHours       int     `json:"gap_hours"`
	SaturdayHours  int     `json:"saturday_hours"`
}

type UnplacedLesson struct {
	ClassName   string  `json:"class_name"`
	SubjectName string  `json:"subject_name"`
	TeacherName string  `json:"teacher_name"`
	Hours       float64 `json:"hours"`
	Reason      string  `json:"reason"`
}

type ScheduleResult struct {
	Slots        []GeneratedSlot   `json:"slots"`
	QualityScore int               `json:"quality_score"`
	TeacherLoads []TeacherLoadStat `json:"teacher_loads"`
	Warnings     []string          `json:"warnings"`
	Unplaced     []UnplacedLesson  `json:"unplaced"`
}

type timeSlot struct {
	start     string
	end       string
	isMorning bool
	isLate    bool
	period    int // 0=morning, 1=afternoon
}

func addOneHour(hm string) string {
	var h, m int
	_, _ = fmt.Sscanf(hm, "%d:%d", &h, &m)
	return fmt.Sprintf("%02d:%02d", (h+1)%24, m)
}

func buildTimeSlots(cfg ScheduleConfig) ([]int, []timeSlot) {
	days := cfg.Days
	if len(days) == 0 {
		days = []int{1, 2, 3, 4, 5, 6}
	}
	morning := cfg.MorningSlots
	afternoon := cfg.AfternoonSlots
	if len(morning) == 0 && len(afternoon) == 0 {
		morning = []string{"08:00", "09:00", "10:00", "11:00"}
		afternoon = []string{"13:00", "14:00", "15:00", "16:00"}
	}
	var slots []timeSlot
	for _, s := range morning {
		slots = append(slots, timeSlot{start: s, end: addOneHour(s), isMorning: true, period: 0})
	}
	for i, s := range afternoon {
		slots = append(slots, timeSlot{start: s, end: addOneHour(s), isMorning: false, isLate: i >= len(afternoon)-2, period: 1})
	}
	return days, slots
}

type lessonBlock struct {
	teacherID   string
	teacherName string
	classID     string
	className   string
	subjectID   string
	subjectCode string
	subjectName string
	duration    int // 1 or 2 consecutive slots
	weight      string
	roomType    string
}

// GenerateTimetable computes a fair, conflict-free weekly timetable respecting
// teacher statutory max_weekly_hours, available rooms, and pinned slots.
func GenerateTimetable(
	cfg ScheduleConfig,
	assignments []db.TeacherAssignment,
	curricula []db.LevelCurriculum,
	rooms []db.Room,
	pinned []db.TimetableSlot,
) ScheduleResult {
	days, slots := buildTimeSlots(cfg)
	if len(rooms) == 0 {
		for i := 1; i <= 6; i++ {
			rooms = append(rooms, db.Room{Name: fmt.Sprintf("قاعة %d", i), RoomType: "standard", IsActive: true})
		}
	}

	// Index curricula by (level|subjectID)
	curByKey := map[string]db.LevelCurriculum{}
	curBySubj := map[string]db.LevelCurriculum{}
	for _, c := range curricula {
		curByKey[c.Level+"|"+c.SubjectID] = c
		if _, ok := curBySubj[c.SubjectID]; !ok {
			curBySubj[c.SubjectID] = c
		}
	}

	// Track occupancy: busy[day][slotIdx]
	type occKey struct {
		day int
		idx int
	}
	teacherBusy := map[string]map[occKey]bool{}
	classBusy := map[string]map[occKey]bool{}
	roomBusy := map[string]map[occKey]bool{}
	classDaySubj := map[string]int{} // classID|day|subjID -> count
	classPrevRoom := map[string]string{}
	teacherHours := map[string]float64{}
	teacherMax := map[string]float64{}
	teacherNames := map[string]string{}
	teacherAssigned := map[string]float64{}
	teacherDayHours := map[string]int{} // teacherID|day -> hours
	teacherSatHours := map[string]int{}
	teacherLateHours := map[string]int{}

	markBusy := func(m map[string]map[occKey]bool, id string, day, idx int, v bool) {
		if m[id] == nil {
			m[id] = map[occKey]bool{}
		}
		if v {
			m[id][occKey{day, idx}] = true
		} else {
			delete(m[id], occKey{day, idx})
		}
	}

	// Pre-register pinned slots
	pinnedHoursByPair := map[string]float64{}
	var resultSlots []GeneratedSlot

	for _, p := range pinned {
		tName := p.TeacherID
		if p.Teacher != nil {
			tName = p.Teacher.FullName
			if tName == "" {
				tName = p.Teacher.Username
			}
			maxH := p.Teacher.MaxWeeklyHours
			if maxH <= 0 {
				maxH = 25
			}
			teacherMax[p.TeacherID] = maxH
			teacherNames[p.TeacherID] = tName
		}
		var cName, sCode, sName *string
		if p.Class != nil {
			n := p.Class.Name
			cName = &n
		}
		if p.Subject != nil {
			c, n := p.Subject.Code, p.Subject.NameAr
			sCode, sName = &c, &n
		}
		dur := 0
		for si, sl := range slots {
			if sl.start < p.End && p.Start < sl.end {
				dur++
				markBusy(teacherBusy, p.TeacherID, p.Day, si, true)
				if p.ClassID != nil {
					markBusy(classBusy, *p.ClassID, p.Day, si, true)
				}
				if p.Room != "" {
					markBusy(roomBusy, p.Room, p.Day, si, true)
				}
				teacherDayHours[fmt.Sprintf("%s|%d", p.TeacherID, p.Day)]++
				if p.Day == 6 {
					teacherSatHours[p.TeacherID]++
				}
				if sl.isLate {
					teacherLateHours[p.TeacherID]++
				}
			}
		}
		if dur == 0 {
			dur = 1
		}
		teacherHours[p.TeacherID] += float64(dur)
		if p.ClassID != nil && p.SubjectID != nil {
			pinnedHoursByPair[*p.ClassID+"|"+*p.SubjectID] += float64(dur)
			classDaySubj[fmt.Sprintf("%s|%d|%s", *p.ClassID, p.Day, *p.SubjectID)]++
		}
		resultSlots = append(resultSlots, GeneratedSlot{
			TeacherID:   p.TeacherID,
			TeacherName: tName,
			ClassID:     p.ClassID,
			ClassName:   cName,
			SubjectID:   p.SubjectID,
			SubjectCode: sCode,
			SubjectName: sName,
			Day:         p.Day,
			Start:       p.Start,
			End:         p.End,
			Room:        p.Room,
			Label:       p.Label,
			IsPinned:    true,
		})
	}

	// Build lesson blocks from TeacherAssignments
	var blocks []lessonBlock
	var warnings []string
	seenPair := map[string]bool{}

	for _, a := range assignments {
		if a.Teacher == nil || a.Class == nil || a.Subject == nil {
			continue
		}
		tName := a.Teacher.FullName
		if tName == "" {
			tName = a.Teacher.Username
		}
		maxH := a.Teacher.MaxWeeklyHours
		if maxH <= 0 {
			maxH = 25
		}
		teacherMax[a.TeacherID] = maxH
		teacherNames[a.TeacherID] = tName

		pairKey := a.ClassID + "|" + a.SubjectID
		if seenPair[pairKey] {
			continue
		}
		seenPair[pairKey] = true

		level := ""
		if a.Class.Level != nil {
			level = *a.Class.Level
		}
		cur, ok := curByKey[level+"|"+a.SubjectID]
		if !ok {
			if fallback, ok2 := curBySubj[a.SubjectID]; ok2 {
				cur = fallback
			} else {
				cur = db.LevelCurriculum{WeeklyHours: 2, BlockSize: 1, CognitiveWeight: "heavy", RoomType: "standard"}
			}
		}
		teacherAssigned[a.TeacherID] += cur.WeeklyHours

		rem := int(math.Round(cur.WeeklyHours - pinnedHoursByPair[pairKey]))
		if rem <= 0 {
			continue
		}
		blkSize := int(math.Round(cur.BlockSize))
		if blkSize < 1 {
			blkSize = 1
		}
		if blkSize > 2 {
			blkSize = 2
		}

		for rem > 0 {
			d := blkSize
			if rem < d {
				d = rem
			}
			blocks = append(blocks, lessonBlock{
				teacherID:   a.TeacherID,
				teacherName: tName,
				classID:     a.ClassID,
				className:   a.Class.Name,
				subjectID:   a.SubjectID,
				subjectCode: a.Subject.Code,
				subjectName: a.Subject.NameAr,
				duration:    d,
				weight:      cur.CognitiveWeight,
				roomType:    cur.RoomType,
			})
			rem -= d
		}
	}

	// Pre-flight feasibility warnings
	for tid, assigned := range teacherAssigned {
		maxH := teacherMax[tid]
		if assigned > maxH {
			warnings = append(warnings, fmt.Sprintf(
				"المعلم %s مسند له %.0f ساعة بينما نصابه الأسبوعي %.0f ساعة (زيادة %.0f ساعة)",
				teacherNames[tid], assigned, maxH, assigned-maxH,
			))
		}
	}

	totalNeededHours := 0
	for _, b := range blocks {
		totalNeededHours += b.duration
	}
	totalRoomCapacity := len(rooms) * len(days) * len(slots)
	if totalNeededHours > totalRoomCapacity {
		warnings = append(warnings, fmt.Sprintf(
			"مجموع ساعات الدروس (%d ساعة) يتجاوز طاقة القاعات المتاحة (%d ساعة)",
			totalNeededHours, totalRoomCapacity,
		))
	}

	// MRV sort: specialized rooms first, 2h blocks first, busiest teachers first
	sort.Slice(blocks, func(i, j int) bool {
		iSpec := blocks[i].roomType != "standard"
		jSpec := blocks[j].roomType != "standard"
		if iSpec != jSpec {
			return iSpec
		}
		if blocks[i].duration != blocks[j].duration {
			return blocks[i].duration > blocks[j].duration
		}
		return teacherAssigned[blocks[i].teacherID] > teacherAssigned[blocks[j].teacherID]
	})

	var unplaced []UnplacedLesson

	for _, b := range blocks {
		if teacherHours[b.teacherID]+float64(b.duration) > teacherMax[b.teacherID] {
			unplaced = append(unplaced, UnplacedLesson{
				ClassName:   b.className,
				SubjectName: b.subjectName,
				TeacherName: b.teacherName,
				Hours:       float64(b.duration),
				Reason:      fmt.Sprintf("تجاوز النصاب الأسبوعي للمعلم (%.0f ساعة)", teacherMax[b.teacherID]),
			})
			continue
		}

		// Collect candidate rooms matching roomType (fallback to standard if none)
		var candRooms []db.Room
		for _, rm := range rooms {
			if rm.IsActive && rm.RoomType == b.roomType {
				candRooms = append(candRooms, rm)
			}
		}
		if len(candRooms) == 0 {
			for _, rm := range rooms {
				if rm.IsActive {
					candRooms = append(candRooms, rm)
				}
			}
		}

		bestScore := -1e9
		bestDay, bestIdx := -1, -1
		bestRoom := ""

		for _, day := range days {
			for si := 0; si+b.duration <= len(slots); si++ {
				// Keep blocks within same morning/afternoon period
				if b.duration == 2 && slots[si].period != slots[si+1].period {
					continue
				}
				// Check teacher & class availability
				ok := true
				for k := 0; k < b.duration; k++ {
					key := occKey{day, si + k}
					if teacherBusy[b.teacherID][key] || classBusy[b.classID][key] {
						ok = false
						break
					}
				}
				if !ok {
					continue
				}

				// Find best available room for this (day, si)
				chosenRoom := ""
				for _, rm := range candRooms {
					rmOK := true
					for k := 0; k < b.duration; k++ {
						if roomBusy[rm.Name][occKey{day, si + k}] {
							rmOK = false
							break
						}
					}
					if rmOK {
						chosenRoom = rm.Name
						// Prefer same room the class already used today (room stickiness)
						if classPrevRoom[fmt.Sprintf("%s|%d", b.classID, day)] == rm.Name {
							break
						}
					}
				}
				if chosenRoom == "" {
					continue
				}

				// ── Soft constraint scoring (fair & objective) ──
				score := 0.0
				// 1. Cognitive weight: heavy subjects in morning, light later
				if b.weight == "heavy" {
					if slots[si].isMorning {
						score += 18
					} else {
						score -= 8
					}
				} else {
					if !slots[si].isMorning {
						score += 10
					}
				}
				// 2. Spread subject across days (penalize repeating same subject on same day)
				sameSubj := classDaySubj[fmt.Sprintf("%s|%d|%s", b.classID, day, b.subjectID)]
				score -= float64(sameSubj) * 28.0
				// 3. Minimize teacher idle gaps (reward adjacency to existing teacher slot on same day)
				tDay := teacherDayHours[fmt.Sprintf("%s|%d", b.teacherID, day)]
				if tDay > 0 {
					adjBefore := si > 0 && teacherBusy[b.teacherID][occKey{day, si - 1}]
					adjAfter := si+b.duration < len(slots) && teacherBusy[b.teacherID][occKey{day, si + b.duration}]
					if adjBefore || adjAfter {
						score += 22
					} else {
						score -= 14 // creates a gap
					}
				}
				// 4. Balance daily load per teacher (avoid > 5h/day)
				if tDay+b.duration > 5 {
					score -= 20
				}
				// 5. Fair Saturday & late-afternoon distribution across all teachers
				if day == 6 {
					score -= float64(teacherSatHours[b.teacherID]) * 10.0
				}
				if slots[si].isLate {
					score -= float64(teacherLateHours[b.teacherID]) * 6.0
				}
				// 6. Room stickiness
				if classPrevRoom[fmt.Sprintf("%s|%d", b.classID, day)] == chosenRoom {
					score += 6
				}

				if score > bestScore {
					bestScore = score
					bestDay = day
					bestIdx = si
					bestRoom = chosenRoom
				}
			}
		}

		if bestDay == -1 {
			unplaced = append(unplaced, UnplacedLesson{
				ClassName:   b.className,
				SubjectName: b.subjectName,
				TeacherName: b.teacherName,
				Hours:       float64(b.duration),
				Reason:      "لا يوجد توقيت أو قاعة شاغرة متوافقة بين المعلم والقسم",
			})
			continue
		}

		// Commit placement
		for k := 0; k < b.duration; k++ {
			markBusy(teacherBusy, b.teacherID, bestDay, bestIdx+k, true)
			markBusy(classBusy, b.classID, bestDay, bestIdx+k, true)
			markBusy(roomBusy, bestRoom, bestDay, bestIdx+k, true)
		}
		teacherHours[b.teacherID] += float64(b.duration)
		teacherDayHours[fmt.Sprintf("%s|%d", b.teacherID, bestDay)] += b.duration
		if bestDay == 6 {
			teacherSatHours[b.teacherID] += b.duration
		}
		if slots[bestIdx].isLate {
			teacherLateHours[b.teacherID] += b.duration
		}
		classDaySubj[fmt.Sprintf("%s|%d|%s", b.classID, bestDay, b.subjectID)]++
		classPrevRoom[fmt.Sprintf("%s|%d", b.classID, bestDay)] = bestRoom

		cID, cName := b.classID, b.className
		sID, sCode, sName := b.subjectID, b.subjectCode, b.subjectName
		resultSlots = append(resultSlots, GeneratedSlot{
			TeacherID:   b.teacherID,
			TeacherName: b.teacherName,
			ClassID:     &cID,
			ClassName:   &cName,
			SubjectID:   &sID,
			SubjectCode: &sCode,
			SubjectName: &sName,
			Day:         bestDay,
			Start:       slots[bestIdx].start,
			End:         slots[bestIdx+b.duration-1].end,
			Room:        bestRoom,
			IsPinned:    false,
		})
	}

	// Compute teacher stats & quality score
	var loads []TeacherLoadStat
	totalGaps := 0
	for tid, name := range teacherNames {
		gaps := 0
		for _, day := range days {
			first, last, cnt := -1, -1, 0
			for si := range slots {
				if teacherBusy[tid][occKey{day, si}] {
					if first == -1 {
						first = si
					}
					last = si
					cnt++
				}
			}
			if cnt > 1 {
				gaps += (last - first + 1) - cnt
			}
		}
		totalGaps += gaps
		loads = append(loads, TeacherLoadStat{
			TeacherID:      tid,
			TeacherName:    name,
			MaxWeeklyHours: teacherMax[tid],
			AssignedHours:  teacherAssigned[tid],
			ScheduledHours: teacherHours[tid],
			GapHours:       gaps,
			SaturdayHours:  teacherSatHours[tid],
		})
	}
	sort.Slice(loads, func(i, j int) bool { return loads[i].TeacherName < loads[j].TeacherName })

	quality := 100
	if len(blocks) > 0 {
		placedRatio := float64(len(blocks)-len(unplaced)) / float64(len(blocks))
		quality = int(math.Round(placedRatio * 100))
	}
	quality -= totalGaps * 2
	if quality < 0 {
		quality = 0
	}

	if resultSlots == nil {
		resultSlots = []GeneratedSlot{}
	}
	if warnings == nil {
		warnings = []string{}
	}
	if unplaced == nil {
		unplaced = []UnplacedLesson{}
	}
	if loads == nil {
		loads = []TeacherLoadStat{}
	}

	return ScheduleResult{
		Slots:        resultSlots,
		QualityScore: quality,
		TeacherLoads: loads,
		Warnings:     warnings,
		Unplaced:     unplaced,
	}
}
