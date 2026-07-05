#!/usr/bin/env python3
"""
Build an AI-friendly project zip for code review / analysis.

Default behavior:
- Preserves folder structure.
- Includes source files, docs, tests, fixtures, config files, etc.
- Excludes generated/noisy folders such as:
  - .git
  - node_modules
  - tests/runtime-app
  - playwright-report
  - test-results
  - backups
  - __pycache__
  - mysql_data / MariaDB data directories
  - optional SQLite/database POC folders unless --include-db-poc is used
- Adds a README_FOR_AI.md file inside the zip explaining what is included.

Usage:
    python make-ai-review-zip.py

Optional:
    python make-ai-review-zip.py --top-folder 00
    python make-ai-review-zip.py --include-runtime-app
    python make-ai-review-zip.py --include-backups
    python make-ai-review-zip.py --include-db-poc
    python make-ai-review-zip.py --include-tools
    python make-ai-review-zip.py --max-files-per-zip 10
    python make-ai-review-zip.py --dry-run

Gemini split mode:
- Use --max-files-per-zip 10 to create multiple zip files when needed.
- Split zip files contain project files only, so the limit applies to real files.
- A single external manifest is written beside the split zip files.
- Default single-zip behavior still includes README_FOR_AI.md inside the zip.
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import sys
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED


DEFAULT_ZIP_PREFIX = "clash-fleet-manager"

DEFAULT_EXCLUDED_DIR_NAMES = {
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    "env",
    "playwright-report",
    "test-results",
    "coverage",
    "tmp",
    "temp",
    "ai-review-zips",
    "mysql_data",
    "mariadb_data",
    "database_data",
    "db_data",
}

DEFAULT_EXCLUDED_FILE_PATTERNS = {
    "*.zip",
    "*.pyc",
    "*.pyo",
    "*.log",
    "*.pid",
    "*.sock",
    "*.ibd",
    "*.MAD",
    "*.MAI",
    "*.frm",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "aria_log*",
    "ib_logfile*",
    "ibdata*",
    "multi-master.info",
    "schema_use_case_tests_output.txt",
    "README_FOR_AI.md",
    ".DS_Store",
    "Thumbs.db",
}

DEFAULT_EXCLUDED_PATH_PATTERNS = {
    "tests/runtime-app/*",
    "tests/runtime-app/**/*",
    "tests/runtime-app",
    "data/backups/*",
    "data/backups/**/*",
    "tests/runtime-app/data/backups/*",
    "tests/runtime-app/data/backups/**/*",
}


DEFAULT_DB_POC_PATH_PATTERNS = {
    "db_test",
    "db_test/*",
    "db_test/**/*",
    "poc-sqlite",
    "poc-sqlite/*",
    "poc-sqlite/**/*",
    "schema.sql",
    "snapshot_sqlite_api_poc.php",
    "snapshot_sqlite_poc.html",
}

DEFAULT_TOOLING_PATH_PATTERNS = {
    "Tools",
    "Tools/*",
    "Tools/**/*",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create an AI-friendly project zip while preserving folder structure."
    )

    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root folder to zip. Default: current directory.",
    )

    parser.add_argument(
        "--output-dir",
        default="ai-review-zips",
        help="Folder where the zip file will be created. Default: ai-review-zips.",
    )

    parser.add_argument(
        "--zip-prefix",
        default=DEFAULT_ZIP_PREFIX,
        help=f"Zip filename prefix. Default: {DEFAULT_ZIP_PREFIX}.",
    )

    parser.add_argument(
        "--top-folder",
        default=None,
        help=(
            "Top-level folder name inside the zip. "
            "Default: project folder name. Example: --top-folder 00"
        ),
    )

    parser.add_argument(
        "--include-runtime-app",
        action="store_true",
        help="Include tests/runtime-app. Normally excluded because it is generated.",
    )

    parser.add_argument(
        "--include-backups",
        action="store_true",
        help="Include backup JSON/files. Normally excluded because they are noisy.",
    )

    parser.add_argument(
        "--include-db-poc",
        action="store_true",
        help=(
            "Include SQLite/database proof-of-concept files. "
            "Normally excluded for focused app/front-end review."
        ),
    )

    parser.add_argument(
        "--include-tools",
        action="store_true",
        help=(
            "Include repo tooling/helper scripts. "
            "Normally excluded because they are not application runtime files."
        ),
    )

    parser.add_argument(
        "--max-file-mb",
        type=float,
        default=10.0,
        help="Skip individual files larger than this size in MB. Default: 10.",
    )

    parser.add_argument(
        "--max-files-per-zip",
        type=int,
        default=None,
        help=(
            "Split output into multiple zip files with at most this many project "
            "files per zip. Useful for AI tools with zip file-count limits, such "
            "as Gemini. Split zip files do not include README_FOR_AI.md; one "
            "external manifest is written beside the zip parts."
        ),
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be included without creating the zip.",
    )

    return parser.parse_args()


def path_matches_any_pattern(relative_posix: str, patterns: set[str]) -> bool:
    return any(fnmatch.fnmatch(relative_posix, pattern) for pattern in patterns)


def should_exclude_path(
    path: Path,
    project_root: Path,
    output_dir: Path,
    excluded_path_patterns: set[str],
    include_runtime_app: bool,
    include_backups: bool,
    include_db_poc: bool,
    include_tools: bool,
    max_file_bytes: int,
) -> tuple[bool, str | None]:
    """
    Return (should_exclude, reason).
    """
    try:
        relative_path = path.relative_to(project_root)
    except ValueError:
        return True, "outside project root"

    relative_posix = relative_path.as_posix()
    parts = set(relative_path.parts)

    # Never include the generated output folder.
    try:
        path.relative_to(output_dir)
        return True, "inside output directory"
    except ValueError:
        pass

    # Directory/file names to ignore anywhere in the tree.
    for part in relative_path.parts:
        if part in DEFAULT_EXCLUDED_DIR_NAMES:
            return True, f"excluded folder/name: {part}"

    # Optional runtime-app exclusion.
    if not include_runtime_app:
        if relative_posix == "tests/runtime-app" or relative_posix.startswith("tests/runtime-app/"):
            return True, "generated runtime app"

    # Optional backup exclusion.
    if not include_backups:
        if (
            "/backups/" in f"/{relative_posix}/"
            or relative_posix.endswith("/backups")
            or relative_posix == "backups"
        ):
            return True, "backup folder"

    # Optional database/SQLite POC exclusion.
    if not include_db_poc and path_matches_any_pattern(relative_posix, DEFAULT_DB_POC_PATH_PATTERNS):
        return True, "optional database/SQLite POC"

    # Optional tooling/helper-script exclusion.
    if not include_tools and path_matches_any_pattern(relative_posix, DEFAULT_TOOLING_PATH_PATTERNS):
        return True, "optional repo tooling/helper scripts"

    # Path-level patterns.
    active_excluded_path_patterns = set(excluded_path_patterns)

    if include_runtime_app:
        active_excluded_path_patterns = {
            p for p in active_excluded_path_patterns if not p.startswith("tests/runtime-app")
        }

    if include_backups:
        active_excluded_path_patterns = {
            p for p in active_excluded_path_patterns if "backups" not in p
        }

    if path_matches_any_pattern(relative_posix, active_excluded_path_patterns):
        return True, "excluded path pattern"

    # File pattern exclusions.
    if path.is_file():
        if path_matches_any_pattern(path.name, DEFAULT_EXCLUDED_FILE_PATTERNS):
            return True, "excluded file pattern"

        try:
            file_size = path.stat().st_size
        except OSError:
            return True, "could not stat file"

        if file_size > max_file_bytes:
            return True, f"file larger than {max_file_bytes / (1024 * 1024):.1f} MB"

    return False, None


def collect_files(
    project_root: Path,
    output_dir: Path,
    include_runtime_app: bool,
    include_backups: bool,
    include_db_poc: bool,
    include_tools: bool,
    max_file_mb: float,
) -> tuple[list[Path], list[tuple[Path, str]]]:
    max_file_bytes = int(max_file_mb * 1024 * 1024)

    included: list[Path] = []
    excluded: list[tuple[Path, str]] = []

    for current_root, dirnames, filenames in os.walk(project_root):
        current_root_path = Path(current_root)

        # Prune directories early so os.walk does not descend into noisy folders.
        pruned_dirnames = []
        for dirname in dirnames:
            dir_path = current_root_path / dirname
            exclude, reason = should_exclude_path(
                dir_path,
                project_root,
                output_dir,
                DEFAULT_EXCLUDED_PATH_PATTERNS,
                include_runtime_app,
                include_backups,
                include_db_poc,
                include_tools,
                max_file_bytes,
            )

            if exclude:
                excluded.append((dir_path, reason or "excluded"))
            else:
                pruned_dirnames.append(dirname)

        dirnames[:] = pruned_dirnames

        for filename in filenames:
            file_path = current_root_path / filename

            exclude, reason = should_exclude_path(
                file_path,
                project_root,
                output_dir,
                DEFAULT_EXCLUDED_PATH_PATTERNS,
                include_runtime_app,
                include_backups,
                include_db_poc,
                include_tools,
                max_file_bytes,
            )

            if exclude:
                excluded.append((file_path, reason or "excluded"))
            else:
                included.append(file_path)

    included.sort(key=lambda p: p.relative_to(project_root).as_posix().lower())
    excluded.sort(key=lambda item: item[0].relative_to(project_root).as_posix().lower())

    return included, excluded


def build_manifest(
    project_root: Path,
    included_files: list[Path],
    excluded_items: list[tuple[Path, str]],
    include_runtime_app: bool,
    include_backups: bool,
    include_db_poc: bool,
    include_tools: bool,
    max_file_mb: float,
) -> str:
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    included_lines = []
    for file_path in included_files:
        relative = file_path.relative_to(project_root).as_posix()
        size_kb = file_path.stat().st_size / 1024
        included_lines.append(f"- {relative} ({size_kb:.1f} KB)")

    excluded_lines = []
    for path, reason in excluded_items:
        try:
            relative = path.relative_to(project_root).as_posix()
        except ValueError:
            relative = str(path)
        excluded_lines.append(f"- {relative} — {reason}")

    runtime_note = (
        "Included because --include-runtime-app was used."
        if include_runtime_app
        else "Excluded by default because it is generated/disposable test output."
    )

    backups_note = (
        "Included because --include-backups was used."
        if include_backups
        else "Excluded by default because backups are usually noisy for AI review."
    )

    db_poc_note = (
        "Included because --include-db-poc was used."
        if include_db_poc
        else "Excluded by default to keep ordinary app/front-end reviews focused."
    )

    tooling_note = (
        "Included because --include-tools was used."
        if include_tools
        else "Excluded by default because helper scripts are not application runtime files."
    )

    return f"""# README_FOR_AI

This zip was generated for AI-assisted project review.

Generated at: {generated_at}
Project root folder: {project_root.name}

## Review guidance

This project is the Clash Fleet Manager app.

Primary source files are expected to be near the project root, such as:

- index.html
- styles.css
- app-config.js
- app-utils.js
- coc-data-map.js
- api.php

Important test/support files may include:

- tests/e2e/baseline.spec.js
- tests/support/prepare-test-app.mjs
- tests/fixtures/data/*.json

## Token-management guidance

Do not read every file unless the user explicitly asks for a full project review.

Recommended approach:

1. Inspect this manifest and the folder structure.
2. Read only the files relevant to the user's task.
3. Avoid generated, duplicate, or backup files unless specifically debugging them.

## Generated/runtime folders

tests/runtime-app:
{runtime_note}

Backups:
{backups_note}

Database / SQLite POC files:
{db_poc_note}

Tooling/helper scripts:
{tooling_note}

Maximum individual file size included:
{max_file_mb:.1f} MB

## Included files

{chr(10).join(included_lines) if included_lines else "- None"}

## Excluded items

{chr(10).join(excluded_lines) if excluded_lines else "- None"}
"""


def chunk_files(files: list[Path], max_files_per_zip: int) -> list[list[Path]]:
    if max_files_per_zip <= 0:
        raise ValueError("max_files_per_zip must be greater than zero")

    return [
        files[index : index + max_files_per_zip]
        for index in range(0, len(files), max_files_per_zip)
    ]


def build_split_zip_filename(
    zip_prefix: str,
    timestamp: str,
    part_index: int,
    part_count: int,
) -> str:
    part_width = max(2, len(str(part_count)))
    return (
        f"{zip_prefix}-{timestamp}-"
        f"part{part_index:0{part_width}d}-of{part_count:0{part_width}d}.zip"
    )


def build_split_manifest(
    project_root: Path,
    included_files: list[Path],
    excluded_items: list[tuple[Path, str]],
    include_runtime_app: bool,
    include_backups: bool,
    include_db_poc: bool,
    include_tools: bool,
    max_file_mb: float,
    max_files_per_zip: int,
    split_packages: list[tuple[str, list[Path]]],
) -> str:
    base_manifest = build_manifest(
        project_root=project_root,
        included_files=included_files,
        excluded_items=excluded_items,
        include_runtime_app=include_runtime_app,
        include_backups=include_backups,
        include_db_poc=include_db_poc,
        include_tools=include_tools,
        max_file_mb=max_file_mb,
    )

    split_lines = [
        "## Split zip package details",
        "",
        "Split mode was enabled with --max-files-per-zip.",
        "",
        "The split zip files intentionally contain project files only.",
        (
            "README_FOR_AI.md is not included inside each split zip so the "
            "per-zip file limit applies to real project files."
        ),
        "",
        f"Maximum project files per zip: {max_files_per_zip}",
        f"Total project files: {len(included_files)}",
        f"Total zip files: {len(split_packages)}",
        "",
    ]

    for zip_filename, files in split_packages:
        split_lines.append(f"### {zip_filename}")
        split_lines.append("")
        split_lines.append(f"Project files in this zip: {len(files)}")
        split_lines.append("")

        if files:
            for file_path in files:
                relative = file_path.relative_to(project_root).as_posix()
                size_kb = file_path.stat().st_size / 1024
                split_lines.append(f"- {relative} ({size_kb:.1f} KB)")
        else:
            split_lines.append("- None")

        split_lines.append("")

    return f"{base_manifest}\n\n" + "\n".join(split_lines)


def print_split_plan(
    project_root: Path,
    split_packages: list[tuple[str, list[Path]]],
    max_files_per_zip: int,
) -> None:
    print()
    print("Split mode:          enabled")
    print(f"Max files per zip:   {max_files_per_zip}")
    print(f"Zip files planned:   {len(split_packages)}")

    for zip_filename, files in split_packages:
        print()
        print(f"{zip_filename}:")
        for file_path in files:
            print(f"  {file_path.relative_to(project_root).as_posix()}")


def create_zip(
    zip_path: Path,
    project_root: Path,
    top_folder: str,
    included_files: list[Path],
    manifest_text: str | None,
) -> None:
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zip_file:
        if manifest_text is not None:
            # Add generated AI manifest first.
            manifest_arcname = Path(top_folder) / "README_FOR_AI.md"
            zip_file.writestr(manifest_arcname.as_posix(), manifest_text)

        # Add real project files.
        for file_path in included_files:
            relative_path = file_path.relative_to(project_root)
            archive_path = Path(top_folder) / relative_path
            zip_file.write(file_path, archive_path.as_posix())


def main() -> int:
    args = parse_args()

    if args.max_files_per_zip is not None and args.max_files_per_zip <= 0:
        print("ERROR: --max-files-per-zip must be greater than zero.", file=sys.stderr)
        return 1

    project_root = Path(args.project_root).resolve()

    if not project_root.exists():
        print(f"ERROR: Project root does not exist: {project_root}", file=sys.stderr)
        return 1

    if not project_root.is_dir():
        print(f"ERROR: Project root is not a directory: {project_root}", file=sys.stderr)
        return 1

    output_dir = (project_root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    top_folder = args.top_folder or project_root.name

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    zip_filename = f"{args.zip_prefix}-{timestamp}.zip"
    zip_path = output_dir / zip_filename

    included_files, excluded_items = collect_files(
        project_root=project_root,
        output_dir=output_dir,
        include_runtime_app=args.include_runtime_app,
        include_backups=args.include_backups,
        include_db_poc=args.include_db_poc,
        include_tools=args.include_tools,
        max_file_mb=args.max_file_mb,
    )

    manifest_text = build_manifest(
        project_root=project_root,
        included_files=included_files,
        excluded_items=excluded_items,
        include_runtime_app=args.include_runtime_app,
        include_backups=args.include_backups,
        include_db_poc=args.include_db_poc,
        include_tools=args.include_tools,
        max_file_mb=args.max_file_mb,
    )

    total_bytes = sum(path.stat().st_size for path in included_files)
    total_mb = total_bytes / (1024 * 1024)

    print()
    print("AI review zip build")
    print("-------------------")
    print(f"Project root:        {project_root}")
    print(f"Top folder in zip:   {top_folder}")
    print(f"Files included:      {len(included_files)}")
    print(f"Approx source size:  {total_mb:.2f} MB")
    print(f"Excluded items:      {len(excluded_items)}")

    split_packages: list[tuple[str, list[Path]]] = []
    if args.max_files_per_zip is not None:
        chunks = chunk_files(included_files, args.max_files_per_zip)
        part_count = len(chunks)
        split_packages = [
            (
                build_split_zip_filename(
                    zip_prefix=args.zip_prefix,
                    timestamp=timestamp,
                    part_index=part_index,
                    part_count=part_count,
                ),
                chunk,
            )
            for part_index, chunk in enumerate(chunks, start=1)
        ]
        print_split_plan(project_root, split_packages, args.max_files_per_zip)

    if args.dry_run:
        print()
        print("Dry run only. No zip created.")

        if args.max_files_per_zip is None:
            print()
            print("Included files:")
            for file_path in included_files:
                print(f"  {file_path.relative_to(project_root).as_posix()}")
        return 0

    if args.max_files_per_zip is not None:
        created_zip_paths: list[Path] = []
        for zip_filename, files in split_packages:
            part_zip_path = output_dir / zip_filename
            create_zip(
                zip_path=part_zip_path,
                project_root=project_root,
                top_folder=top_folder,
                included_files=files,
                manifest_text=None,
            )
            created_zip_paths.append(part_zip_path)

        manifest_filename = f"{args.zip_prefix}-{timestamp}-manifest.txt"
        manifest_path = output_dir / manifest_filename
        split_manifest_text = build_split_manifest(
            project_root=project_root,
            included_files=included_files,
            excluded_items=excluded_items,
            include_runtime_app=args.include_runtime_app,
            include_backups=args.include_backups,
            include_db_poc=args.include_db_poc,
            include_tools=args.include_tools,
            max_file_mb=args.max_file_mb,
            max_files_per_zip=args.max_files_per_zip,
            split_packages=split_packages,
        )
        manifest_path.write_text(split_manifest_text, encoding="utf-8")

        print()
        print("Created split zips:")
        for created_zip_path in created_zip_paths:
            final_size_mb = created_zip_path.stat().st_size / (1024 * 1024)
            print(f"  {created_zip_path} ({final_size_mb:.2f} MB)")

        print(f"External manifest:   {manifest_path}")
        print()
        print("Upload the split zip files when you want Gemini analysis.")
        print("Use the external manifest to see which project files are in each part.")
        print()
        return 0

    create_zip(
        zip_path=zip_path,
        project_root=project_root,
        top_folder=top_folder,
        included_files=included_files,
        manifest_text=manifest_text,
    )

    final_size_mb = zip_path.stat().st_size / (1024 * 1024)

    print()
    print(f"Created zip:         {zip_path}")
    print(f"Zip size:            {final_size_mb:.2f} MB")
    print()
    print("Upload this zip when you want AI analysis.")
    print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())