package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"regexp"
	"strings"

	"github.com/ledongthuc/pdf"
)

type extractedImage struct {
	Name    string
	DataURL string
}

type docItem struct {
	Text   string
	Images []string // data URLs attached to this paragraph/table
	Table  [][]string
}

type importResult struct {
	Blocks []map[string]any
	Images []extractedImage
}

// ── DOCX Extractor (Pure Go: text, tables, AND exact-position illustrations) ──

type docxRels struct {
	Rels []struct {
		ID     string `xml:"Id,attr"`
		Target string `xml:"Target,attr"`
	} `xml:"Relationship"`
}

func extractFromDOCX(data []byte, baseTitle string) importResult {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return importResult{}
	}
	files := map[string]*zip.File{}
	for _, f := range zr.File {
		files[f.Name] = f
	}

	// 1. Parse relationships: rId -> word/media/...
	relMap := map[string]string{}
	if rf, ok := files["word/_rels/document.xml.rels"]; ok {
		if rc, err := rf.Open(); err == nil {
			b, _ := io.ReadAll(io.LimitReader(rc, 2<<20))
			_ = rc.Close()
			var rels docxRels
			if xml.Unmarshal(b, &rels) == nil {
				for _, r := range rels.Rels {
					tgt := strings.TrimPrefix(r.Target, "/")
					if !strings.HasPrefix(tgt, "word/") {
						tgt = path.Clean("word/" + tgt)
					}
					relMap[r.ID] = tgt
				}
			}
		}
	}

	// 2. Load embedded images from word/media/*
	mediaDataURL := map[string]string{}
	allImages := make([]extractedImage, 0)
	imgIdx := 0
	for name, f := range files {
		if !strings.HasPrefix(name, "word/media/") {
			continue
		}
		ext := strings.ToLower(path.Ext(name))
		mime := ""
		switch ext {
		case ".png":
			mime = "image/png"
		case ".jpg", ".jpeg":
			mime = "image/jpeg"
		case ".gif":
			mime = "image/gif"
		case ".webp":
			mime = "image/webp"
		default:
			continue
		}
		if f.UncompressedSize64 < 64 || f.UncompressedSize64 > 1_500_000 {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		raw, err := io.ReadAll(io.LimitReader(rc, 1_500_000))
		_ = rc.Close()
		if err != nil || len(raw) < 64 {
			continue
		}
		imgIdx++
		if imgIdx > 12 {
			break
		}
		du := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)
		mediaDataURL[name] = du
		allImages = append(allImages, extractedImage{
			Name:    fmt.Sprintf("%s — رسم %d", baseTitle, imgIdx),
			DataURL: du,
		})
	}

	// 3. Walk word/document.xml sequentially (paragraphs + tables + inline images)
	docFile, ok := files["word/document.xml"]
	if !ok {
		return importResult{Images: allImages}
	}
	rc, err := docFile.Open()
	if err != nil {
		return importResult{Images: allImages}
	}
	docBytes, _ := io.ReadAll(io.LimitReader(rc, 6<<20))
	_ = rc.Close()

	items := parseDOCXBody(docBytes, relMap, mediaDataURL)
	blocks := segmentFrenchDocument(items, allImages)
	return importResult{Blocks: blocks, Images: allImages}
}

func parseDOCXBody(docBytes []byte, relMap, mediaDataURL map[string]string) []docItem {
	dec := xml.NewDecoder(bytes.NewReader(docBytes))
	var items []docItem

	inTable := false
	inRow := false
	inCell := false
	inPara := false
	inText := false

	var curParaText strings.Builder
	var curParaImgs []string
	var curTable [][]string
	var curRow []string
	var curCellText strings.Builder
	var curTableImgs []string

	extractRelImg := func(attrs []xml.Attr) {
		for _, a := range attrs {
			if a.Name.Local == "embed" || a.Name.Local == "id" {
				if tgt, ok := relMap[a.Value]; ok {
					if du, ok := mediaDataURL[tgt]; ok {
						if inTable {
							curTableImgs = append(curTableImgs, du)
						} else {
							curParaImgs = append(curParaImgs, du)
						}
					}
				}
			}
		}
	}

	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "tbl":
				inTable = true
				curTable = nil
				curTableImgs = nil
			case "tr":
				if inTable {
					inRow = true
					curRow = nil
				}
			case "tc":
				if inRow {
					inCell = true
					curCellText.Reset()
				}
			case "p":
				if !inTable {
					inPara = true
					curParaText.Reset()
					curParaImgs = nil
				}
			case "t":
				inText = true
			case "br":
				if inCell {
					curCellText.WriteString(" ")
				} else if inPara {
					curParaText.WriteString("\n")
				}
			case "blip", "imagedata":
				extractRelImg(t.Attr)
			}
		case xml.CharData:
			if inText {
				s := string(t)
				if inCell {
					curCellText.WriteString(s)
				} else if inPara {
					curParaText.WriteString(s)
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				if !inTable && inPara {
					inPara = false
					txt := strings.TrimSpace(curParaText.String())
					if txt != "" || len(curParaImgs) > 0 {
						items = append(items, docItem{Text: txt, Images: curParaImgs})
					}
				} else if inCell {
					curCellText.WriteString(" ")
				}
			case "tc":
				if inCell {
					inCell = false
					curRow = append(curRow, strings.TrimSpace(curCellText.String()))
				}
			case "tr":
				if inRow {
					inRow = false
					if len(curRow) > 0 {
						curTable = append(curTable, curRow)
					}
				}
			case "tbl":
				if inTable {
					inTable = false
					if len(curTable) > 0 || len(curTableImgs) > 0 {
						items = append(items, docItem{Table: curTable, Images: curTableImgs})
					}
				}
			}
		}
	}
	return items
}

// ── PDF Extractor (Text + Embedded JPEG Illustrations) ───────────────────────

func extractFromPDF(data []byte, baseTitle string) importResult {
	images := extractEmbeddedJPEGs(data, baseTitle)
	var items []docItem

	if reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data))); err == nil {
		var buf strings.Builder
		for i := 1; i <= reader.NumPage() && i <= 5; i++ {
			p := reader.Page(i)
			if p.V.IsNull() {
				continue
			}
			if txt, err := p.GetPlainText(nil); err == nil {
				buf.WriteString(txt)
				buf.WriteString("\n")
			}
		}
		for _, line := range strings.Split(buf.String(), "\n") {
			l := strings.TrimSpace(line)
			if len(l) > 1 {
				items = append(items, docItem{Text: l})
			}
		}
	}

	blocks := segmentFrenchDocument(items, images)
	return importResult{Blocks: blocks, Images: images}
}

// extractEmbeddedJPEGs scans raw PDF bytes for embedded JPEG XObjects (FF D8 FF ... FF D9).
func extractEmbeddedJPEGs(data []byte, baseTitle string) []extractedImage {
	out := make([]extractedImage, 0)
	startMarker := []byte{0xFF, 0xD8, 0xFF}
	endMarker := []byte{0xFF, 0xD9}
	offset := 0
	for len(out) < 8 && offset < len(data) {
		idx := bytes.Index(data[offset:], startMarker)
		if idx < 0 {
			break
		}
		start := offset + idx
		endIdx := bytes.Index(data[start+3:], endMarker)
		if endIdx < 0 {
			break
		}
		end := start + 3 + endIdx + 2
		jpegBytes := data[start:end]
		if len(jpegBytes) >= 2500 && len(jpegBytes) <= 1_200_000 {
			du := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(jpegBytes)
			out = append(out, extractedImage{
				Name:    fmt.Sprintf("%s — رسم %d", baseTitle, len(out)+1),
				DataURL: du,
			})
		}
		offset = end
	}
	return out
}

// ── Tunisian French Smart Exercise Classifier ────────────────────────────────

var (
	reQuestionStart = regexp.MustCompile(`^(?:exercice\s*\d+|ex\.?\s*\d+|\d+\s*[\)\.\-]|q\d+\s*[\)\.\-])`)
	reBlankRun      = regexp.MustCompile(`(\.{3,}|_{3,})`)
)

func segmentFrenchDocument(items []docItem, allImages []extractedImage) []map[string]any {
	blocks := make([]map[string]any, 0)
	if len(items) == 0 {
		// Scanned/image-only exam: create a single starter block if images exist
		if len(allImages) > 0 {
			blocks = append(blocks, map[string]any{
				"id": "ext-1", "section": "lecture", "type": "reading_text", "criterion": "C1", "points": 0,
				"topic": "Document importé",
				"content": map[string]any{
					"title": "Document importé", "text": "", "source": "Import", "image_url": allImages[0].DataURL,
				},
			})
		}
		return blocks
	}

	curSec := "lecture"
	var curLines []string
	var curImgs []string

	flush := func(forceType string) {
		if len(curLines) == 0 && len(curImgs) == 0 {
			return
		}
		blk := classifyFrenchChunk(len(blocks)+1, curSec, forceType, curLines, curImgs)
		if blk != nil {
			blocks = append(blocks, blk)
		}
		curLines = nil
		curImgs = nil
	}

	for _, it := range items {
		// Handle Word tables cleanly -> table_fill block
		if len(it.Table) >= 2 && len(it.Table[0]) >= 2 {
			flush("")
			headers := it.Table[0]
			rows := it.Table[1:]
			content := map[string]any{
				"prompt":  "Je complète le tableau suivant :",
				"headers": headers,
				"rows":    rows,
			}
			if len(it.Images) > 0 {
				content["image_url"] = it.Images[0]
			}
			blocks = append(blocks, map[string]any{
				"id":        fmt.Sprintf("ext-%d", len(blocks)+1),
				"section":   curSec,
				"type":      "table_fill",
				"criterion": "C5",
				"points":    3,
				"topic":     "Tableau à compléter (Import)",
				"content":   content,
			})
			continue
		}

		txt := strings.TrimSpace(it.Text)
		low := strings.ToLower(txt)

		// Detect Tunisian Ministry section transitions
		if len(txt) < 90 && (strings.Contains(low, "langue") || strings.HasPrefix(low, "ii.") || strings.Contains(low, "grammaire") || strings.Contains(low, "conjugaison") || strings.Contains(low, "orthographe")) && !reQuestionStart.MatchString(low) {
			flush("")
			curSec = "langue"
			continue
		}
		if len(txt) < 90 && (strings.Contains(low, "production écrite") || strings.Contains(low, "production ecrite") || strings.HasPrefix(low, "iii.") || strings.Contains(low, "essai")) {
			flush("")
			curSec = "production"
			continue
		}
		if len(txt) < 90 && (strings.Contains(low, "compréhension") || strings.Contains(low, "comprehension") || strings.HasPrefix(low, "i. lecture")) {
			if len(curLines) > 0 {
				flush("reading_text")
			}
			curSec = "lecture"
			continue
		}

		// Detect new exercise / question boundary
		if reQuestionStart.MatchString(low) || strings.HasPrefix(low, "je coche") || strings.HasPrefix(low, "je complète") ||
			strings.HasPrefix(low, "j'écris « vrai") || strings.HasPrefix(low, "je relie") || strings.HasPrefix(low, "je remets") ||
			strings.HasPrefix(low, "je réécris") {
			if len(blocks) == 0 && curSec == "lecture" && len(curLines) > 0 {
				flush("reading_text")
			} else {
				flush("")
			}
		}

		if txt != "" {
			curLines = append(curLines, txt)
		}
		if len(it.Images) > 0 {
			curImgs = append(curImgs, it.Images...)
		}
	}
	flush("")

	// If PDF had embedded images not yet attached to any block, attach them sensibly
	if len(allImages) > 0 {
		usedImgs := map[string]bool{}
		for _, b := range blocks {
			if c, ok := b["content"].(map[string]any); ok {
				if u, ok := c["image_url"].(string); ok && u != "" {
					usedImgs[u] = true
				}
				if ps, ok := c["panels"].([]string); ok {
					for _, p := range ps {
						usedImgs[p] = true
					}
				}
			}
		}
		var unattached []string
		for _, im := range allImages {
			if !usedImgs[im.DataURL] {
				unattached = append(unattached, im.DataURL)
			}
		}
		if len(unattached) > 0 {
			// Attach first to reading_text if empty, rest to production_ecrite panels
			for _, b := range blocks {
				if len(unattached) == 0 {
					break
				}
				bt, _ := b["type"].(string)
				c, _ := b["content"].(map[string]any)
				if (bt == "reading_text" || bt == "reading_comprehension") && c["image_url"] == "" {
					c["image_url"] = unattached[0]
					unattached = unattached[1:]
				}
			}
			for _, b := range blocks {
				if len(unattached) == 0 {
					break
				}
				bt, _ := b["type"].(string)
				c, _ := b["content"].(map[string]any)
				if bt == "production_ecrite" {
					panels, _ := c["panels"].([]string)
					for len(panels) < 4 && len(unattached) > 0 {
						panels = append(panels, unattached[0])
						unattached = unattached[1:]
					}
					c["panels"] = panels
				}
			}
		}
	}

	return blocks
}

func classifyFrenchChunk(num int, sec, forceType string, lines, imgs []string) map[string]any {
	full := strings.TrimSpace(strings.Join(lines, "\n"))
	low := strings.ToLower(full)
	id := fmt.Sprintf("ext-%d", num)

	firstLine := ""
	if len(lines) > 0 {
		firstLine = lines[0]
	}
	imgURL := ""
	if len(imgs) > 0 {
		imgURL = imgs[0]
	}

	// 1. Reading Text
	if forceType == "reading_text" || (sec == "lecture" && num == 1 && len(full) > 140 && !reQuestionStart.MatchString(low)) {
		title := "Texte importé"
		body := full
		if len(lines) > 1 && len(lines[0]) < 70 {
			title = lines[0]
			body = strings.Join(lines[1:], "\n")
		}
		return map[string]any{
			"id": id, "section": "lecture", "type": "reading_text", "criterion": "C1", "points": 0,
			"topic": title,
			"content": map[string]any{
				"title": title, "text": body, "source": "Import", "image_url": imgURL, "numbered_lines": true,
			},
		}
	}

	// 2. Production Écrite
	if sec == "production" || strings.Contains(low, "écris un paragraphe") || strings.Contains(low, "raconte") && len(imgs) >= 2 {
		panels := imgs
		if len(panels) > 4 {
			panels = panels[:4]
		}
		if panels == nil {
			panels = []string{}
		}
		return map[string]any{
			"id": id, "section": "production", "type": "production_ecrite", "criterion": "C1", "points": 6,
			"topic": "Production Écrite (Import)",
			"content": map[string]any{
				"prompt":       full,
				"lines":        6,
				"toolbox":      map[string]any{"nouns": []string{}, "verbs": []string{}, "connectors": []string{"D'abord,", "Ensuite,", "Enfin,"}},
				"panels":       panels,
				"model_answer": "",
			},
		}
	}

	// 3. Vrai / Faux
	if strings.Contains(low, "vrai") && strings.Contains(low, "faux") {
		items := make([]map[string]any, 0)
		for _, l := range lines[1:] {
			clean := strings.TrimSpace(strings.TrimLeft(l, "-•* "))
			if clean != "" {
				items = append(items, map[string]any{"statement": clean, "answer": true})
			}
		}
		if len(items) == 0 {
			items = append(items, map[string]any{"statement": full, "answer": true})
		}
		return map[string]any{
			"id": id, "section": sec, "type": "true_false", "criterion": "C2", "points": 3,
			"topic": "Vrai / Faux (Import)",
			"content": map[string]any{
				"prompt": firstLine, "items": items, "image_url": imgURL,
			},
		}
	}

	// 4. QCM
	if strings.Contains(low, "je coche") || strings.Contains(low, "bonne réponse") || strings.Contains(low, "qcm") {
		opts := make([]string, 0)
		for _, l := range lines[1:] {
			clean := strings.TrimSpace(strings.TrimLeft(l, "-•*☐□ "))
			if clean != "" {
				opts = append(opts, clean)
			}
		}
		if len(opts) < 2 {
			opts = []string{"Option A", "Option B", "Option C"}
		}
		return map[string]any{
			"id": id, "section": sec, "type": "mcq", "criterion": "C2", "points": 2,
			"topic": "QCM (Import)",
			"content": map[string]any{
				"prompt": firstLine, "options": opts, "answer_index": 0, "image_url": imgURL,
			},
		}
	}

	// 5. Fill Blanks (Texte à trous)
	if strings.Contains(low, "complète") || strings.Contains(low, "complete") || reBlankRun.MatchString(full) {
		sents := make([]string, 0)
		srcLines := lines
		if len(lines) > 1 {
			srcLines = lines[1:]
		}
		for _, l := range srcLines {
			clean := strings.TrimSpace(strings.TrimLeft(l, "-•* "))
			if clean != "" {
				clean = reBlankRun.ReplaceAllString(clean, "[...]")
				sents = append(sents, clean)
			}
		}
		return map[string]any{
			"id": id, "section": sec, "type": "fill_blanks", "criterion": "C5", "points": 3,
			"topic": "Texte à trous (Import)",
			"content": map[string]any{
				"prompt": firstLine, "word_bank": []string{}, "sentences": sents, "image_url": imgURL,
			},
		}
	}

	// 6. Scramble (Remets en ordre)
	if strings.Contains(low, "en ordre") || strings.Contains(low, "remets") {
		chunks := []string{}
		if len(lines) > 1 {
			parts := strings.Split(lines[1], "/")
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					chunks = append(chunks, t)
				}
			}
		}
		if len(chunks) < 2 {
			chunks = strings.Fields(full)
		}
		return map[string]any{
			"id": id, "section": sec, "type": "scramble", "criterion": "C3", "points": 2,
			"topic": "Remets en ordre (Import)",
			"content": map[string]any{
				"prompt": firstLine, "chunks": chunks, "answer": "", "image_url": imgURL,
			},
		}
	}

	// 7. Matching (Je relie)
	if strings.Contains(low, "je relie") || strings.Contains(low, "relie par") {
		pairs := make([]map[string]any, 0)
		for _, l := range lines[1:] {
			for _, sep := range []string{"→", "->", "=", "—", "-"} {
				if parts := strings.SplitN(l, sep, 2); len(parts) == 2 {
					pairs = append(pairs, map[string]any{"left": strings.TrimSpace(parts[0]), "right": strings.TrimSpace(parts[1])})
					break
				}
			}
		}
		if len(pairs) == 0 {
			pairs = append(pairs, map[string]any{"left": firstLine, "right": ""})
		}
		return map[string]any{
			"id": id, "section": sec, "type": "matching", "criterion": "C5", "points": 2,
			"topic": "Je relie (Import)",
			"content": map[string]any{
				"prompt": firstLine, "pairs": pairs, "image_url": imgURL,
			},
		}
	}

	// 8. Default: Open Question (with optional illustration!)
	crit := "C4"
	if sec == "langue" {
		crit = "C5"
	}
	return map[string]any{
		"id": id, "section": sec, "type": "open_question", "criterion": crit, "points": 2,
		"topic": truncateStr(firstLine, 48),
		"content": map[string]any{
			"prompt": full, "lines": 2, "answer": "", "image_url": imgURL,
		},
	}
}

func truncateStr(s string, max int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return string(r)
	}
	return string(r[:max]) + "…"
}
