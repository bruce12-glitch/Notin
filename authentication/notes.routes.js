// ============================================================
// notes.routes.js — a PROTECTED, user-scoped resource
// ============================================================
const express = require("express");
const db = require("./db");

const router = express.Router();

// GET /notes — list the current user's notes (newest first)
router.get("/", (req, res) => {
  const notes = db
    .prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC")
    .all(req.userId);
  res.json(notes);
});

// POST /notes — create a note for the current user
router.post("/", (req, res) => {
  const { title = "", body = "" } = req.body || {};
  if (!title && !body) {
    return res.status(400).json({ error: "note needs a title or body" });
  }

  const result = db
    .prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)")
    .run(req.userId, title, body);
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(note);
});

// GET /notes/:id — read one note (only if it belongs to the user)
router.get("/:id", (req, res) => {
  const note = db
    .prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: "note not found" });
  res.json(note);
});

// PUT /notes/:id — update a note (only your own)
router.put("/:id", (req, res) => {
  const { title, body } = req.body || {};
  const existing = db
    .prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: "note not found" });

  db.prepare(
    "UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(
    title ?? existing.title,
    body ?? existing.body,
    req.params.id,
    req.userId
  );

  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  res.json(note);
});

// DELETE /notes/:id — delete a note (only your own)
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: "note not found" });
  res.json({ ok: true });
});

module.exports = router;
