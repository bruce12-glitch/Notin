// ============================================================
// notes.routes.js — validated, protected, user-scoped notes
// ============================================================
const express = require("express");
const db = require("./db");
const { validate } = require("./validators");

const router = express.Router();

function noteId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid note id" });
  req.noteId = id;
  next();
}

router.get("/", (req, res) => {
  const notes = db.prepare(
    "SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 500"
  ).all(req.userId);
  res.json(notes);
});

router.post("/", validate("createNote"), (req, res) => {
  const { title, body } = req.body;
  const result = db.prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)")
    .run(req.userId, title, body);
  const note = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .get(result.lastInsertRowid, req.userId);
  res.status(201).json(note);
});

router.get("/:id", noteId, (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .get(req.noteId, req.userId);
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

router.put("/:id", noteId, validate("updateNote"), (req, res) => {
  const existing = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .get(req.noteId, req.userId);
  if (!existing) return res.status(404).json({ error: "Note not found" });

  db.prepare(
    "UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(
    req.body.title ?? existing.title,
    req.body.body ?? existing.body,
    req.noteId,
    req.userId
  );
  res.json(db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.noteId, req.userId));
});

router.delete("/:id", noteId, (req, res) => {
  const result = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
    .run(req.noteId, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Note not found" });
  res.json({ ok: true });
});

module.exports = router;
