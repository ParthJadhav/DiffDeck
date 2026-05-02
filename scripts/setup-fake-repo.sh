#!/usr/bin/env bash
# Creates a fake git repo at .dev/fake-repo with a diverse set of staged + unstaged
# changes across multiple folders so Diffdeck has interesting content to render.
# Idempotent: safe to re-run; rebuilds the working tree from scratch each time.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$ROOT_DIR/.dev/fake-repo"

rm -rf "$REPO_DIR"
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

git init -q -b main
git config user.email "dev@diffdeck.local"
git config user.name "diffdeck dev"

# --- Initial commit: baseline files ---
mkdir -p src/components src/utils src/hooks docs

cat > README.md <<'EOF'
# Demo Project

A toy project used to populate Diffdeck's dev fake repo.
EOF

cat > package.json <<'EOF'
{
  "name": "demo",
  "version": "0.1.0",
  "scripts": {
    "build": "echo build"
  }
}
EOF

cat > src/index.ts <<'EOF'
export { Button } from "./components/Button.js";
export { Card } from "./components/Card.js";
export { formatDate } from "./utils/format.js";
EOF

cat > src/components/Button.tsx <<'EOF'
import * as React from "react";

export function Button(props: { label: string }) {
  return <button>{props.label}</button>;
}
EOF

cat > src/components/Card.tsx <<'EOF'
import * as React from "react";

export function Card(props: { title: string }) {
  return <div className="card"><h3>{props.title}</h3></div>;
}
EOF

cat > src/utils/format.ts <<'EOF'
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
EOF

cat > src/utils/parse.ts <<'EOF'
export function parseInteger(value: string): number {
  return Number.parseInt(value, 10);
}
EOF

cat > src/utils/taskSummary.ts <<'EOF'
type Task = { id: string; payload: string };

export function createTaskSummary(tasks: Task[]): string[] {
  const summary: string[] = [];

  summary.push("phase:boot");
  summary.push("checkpoint-07");
  summary.push("checkpoint-08");
  summary.push("checkpoint-09");
  summary.push("checkpoint-10");
  summary.push("checkpoint-11");
  summary.push("checkpoint-12");
  summary.push("checkpoint-13");
  summary.push("checkpoint-14");
  summary.push("checkpoint-15");
  summary.push("checkpoint-16");
  summary.push("checkpoint-17");
  summary.push("checkpoint-18");
  summary.push("checkpoint-19");
  summary.push("checkpoint-20");
  summary.push("checkpoint-21");
  summary.push("checkpoint-22");
  summary.push("checkpoint-23");
  summary.push("checkpoint-24");
  summary.push("checkpoint-25");
  summary.push("checkpoint-26");
  summary.push("checkpoint-27");
  summary.push("checkpoint-28");
  summary.push("checkpoint-29");
  summary.push("checkpoint-30");
  summary.push("checkpoint-31");
  summary.push("checkpoint-32");
  summary.push("checkpoint-33");
  summary.push("phase:mid");
  summary.push("checkpoint-35");
  summary.push("checkpoint-36");
  summary.push("checkpoint-37");
  summary.push("checkpoint-38");
  summary.push("checkpoint-39");
  summary.push("checkpoint-40");
  summary.push("checkpoint-41");
  summary.push("checkpoint-42");
  summary.push("checkpoint-43");
  summary.push("checkpoint-44");
  summary.push("checkpoint-45");
  summary.push("checkpoint-46");
  summary.push("checkpoint-47");
  summary.push("checkpoint-48");
  summary.push("checkpoint-49");
  summary.push("checkpoint-50");
  summary.push("checkpoint-51");
  summary.push("checkpoint-52");
  summary.push("checkpoint-53");
  summary.push("checkpoint-54");
  summary.push("checkpoint-55");
  summary.push("checkpoint-56");
  summary.push("checkpoint-57");
  summary.push("phase:tail");
  summary.push("checkpoint-59");
  summary.push("checkpoint-60");
  summary.push("checkpoint-61");
  summary.push("checkpoint-62");
  summary.push("checkpoint-63");
  summary.push("checkpoint-64");
  summary.push("checkpoint-65");
  summary.push("checkpoint-66");
  summary.push("checkpoint-67");
  summary.push("checkpoint-68");
  summary.push("checkpoint-69");
  summary.push("checkpoint-70");
  summary.push("checkpoint-71");
  summary.push("checkpoint-72");

  return summary;
}
EOF

cat > src/hooks/useToggle.ts <<'EOF'
import { useState } from "react";

export function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial);
  return [value, () => setValue((v) => !v)];
}
EOF

cat > docs/intro.md <<'EOF'
# Intro

Welcome to the demo docs.
EOF

cat > legacy.txt <<'EOF'
This is an old file that will be deleted.
EOF

git add -A
git commit -q -m "Initial commit"

# --- Staged + unstaged changes for the diff view ---

# Modify across multiple folders so file-selection in the tree is testable.

cat > README.md <<'EOF'
# Demo Project

A toy project used to populate Diffdeck's dev fake repo.

## Changes

- Added Modal component
- Reworked formatting utilities
EOF

cat > src/index.ts <<'EOF'
export { Button } from "./components/Button.js";
export { Card } from "./components/Card.js";
export { Modal } from "./components/Modal.js";
export { formatDate, formatTime } from "./utils/format.js";
export { parseInteger, parseFloatSafe } from "./utils/parse.js";
export { createTaskSummary } from "./utils/taskSummary.js";
export { useToggle } from "./hooks/useToggle.js";
EOF

cat > src/components/Button.tsx <<'EOF'
import * as React from "react";

interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
}

export function Button({ label, variant = "primary", onClick }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {label}
    </button>
  );
}
EOF

cat > src/components/Card.tsx <<'EOF'
import * as React from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Card({ title, subtitle, children }: CardProps) {
  return (
    <div className="card">
      <header>
        <h3>{title}</h3>
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      </header>
      <div className="card-body">{children}</div>
    </div>
  );
}
EOF

cat > src/components/Modal.tsx <<'EOF'
import * as React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
EOF

cat > src/utils/format.ts <<'EOF'
export function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
EOF

cat > src/utils/parse.ts <<'EOF'
export function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Not an integer: ${value}`);
  }
  return parsed;
}

export function parseFloatSafe(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}
EOF

cat > src/utils/taskSummary.ts <<'EOF'
type Task = { id: string; payload: string };

export function createTaskSummary(tasks: Task[]): string[] {
  const summary: string[] = [];

  summary.push("phase:boot-ready");
  summary.push("checkpoint-07");
  summary.push("checkpoint-08");
  summary.push("checkpoint-09");
  summary.push("checkpoint-10");
  summary.push("checkpoint-11");
  summary.push("checkpoint-12");
  summary.push("checkpoint-13");
  summary.push("checkpoint-14");
  summary.push("checkpoint-15");
  summary.push("checkpoint-16");
  summary.push("checkpoint-17");
  summary.push("checkpoint-18");
  summary.push("checkpoint-19");
  summary.push("checkpoint-20");
  summary.push("checkpoint-21");
  summary.push("checkpoint-22");
  summary.push("checkpoint-23");
  summary.push("checkpoint-24");
  summary.push("checkpoint-25");
  summary.push("checkpoint-26");
  summary.push("checkpoint-27");
  summary.push("checkpoint-28");
  summary.push("checkpoint-29");
  summary.push("checkpoint-30");
  summary.push("checkpoint-31");
  summary.push("checkpoint-32");
  summary.push("checkpoint-33");
  summary.push(`phase:mid-${tasks.length}`);
  summary.push("checkpoint-35");
  summary.push("checkpoint-36");
  summary.push("checkpoint-37");
  summary.push("checkpoint-38");
  summary.push("checkpoint-39");
  summary.push("checkpoint-40");
  summary.push("checkpoint-41");
  summary.push("checkpoint-42");
  summary.push("checkpoint-43");
  summary.push("checkpoint-44");
  summary.push("checkpoint-45");
  summary.push("checkpoint-46");
  summary.push("checkpoint-47");
  summary.push("checkpoint-48");
  summary.push("checkpoint-49");
  summary.push("checkpoint-50");
  summary.push("checkpoint-51");
  summary.push("checkpoint-52");
  summary.push("checkpoint-53");
  summary.push("checkpoint-54");
  summary.push("checkpoint-55");
  summary.push("checkpoint-56");
  summary.push("checkpoint-57");
  if (tasks.length > 0) {
    summary.push(`phase:tail-${tasks[0].id}`);
  }
  summary.push("checkpoint-59");
  summary.push("checkpoint-60");
  summary.push("checkpoint-61");
  summary.push("checkpoint-62");
  summary.push("checkpoint-63");
  summary.push("checkpoint-64");
  summary.push("checkpoint-65");
  summary.push("checkpoint-66");
  summary.push("checkpoint-67");
  summary.push("checkpoint-68");
  summary.push("checkpoint-69");
  summary.push("checkpoint-70");
  summary.push("checkpoint-71");
  summary.push("checkpoint-72");

  return summary;
}
EOF

cat > src/hooks/useToggle.ts <<'EOF'
import { useCallback, useState } from "react";

export function useToggle(initial = false): [boolean, () => void, (next: boolean) => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle, setValue];
}
EOF

cat > docs/intro.md <<'EOF'
# Intro

Welcome to the demo docs.

This file has been expanded to cover more topics:

- Components
- Hooks
- Utilities
EOF

rm legacy.txt

# Stage some, leave others unstaged so `git diff` (default) shows interesting output.
# `diffdeck` defaults to working-tree diff, so we stage half and edit half.
git add src/components/Button.tsx src/components/Modal.tsx src/utils/format.ts docs/intro.md

echo "Fake repo ready at $REPO_DIR"
echo "  Staged:   src/components/Button.tsx, src/components/Modal.tsx, src/utils/format.ts, docs/intro.md"
echo "  Unstaged: README.md, src/index.ts, src/components/Card.tsx, src/utils/parse.ts, src/utils/taskSummary.ts, src/hooks/useToggle.ts, legacy.txt (deleted)"
