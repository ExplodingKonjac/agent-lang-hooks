#!/usr/bin/env python3
"""Create a cross-tool language hooks plugin from the template plugin."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_NAME = "language-hook-template"
TEMPLATE_DIR = ROOT / "templates" / TEMPLATE_NAME
CODEX_MARKETPLACE_PATH = ROOT / ".agents" / "plugins" / "marketplace.json"
CLAUDE_MARKETPLACE_PATH = ROOT / ".claude-plugin" / "marketplace.json"
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
DEFAULT_TARGETS = ("codex", "claude-code", "opencode")


@dataclass(frozen=True)
class PluginMetadata:
    plugin_name: str
    version: str
    display_name: str
    description: str
    author_name: str
    short_description: str
    long_description: str
    developer_name: str
    category: str
    brand_color: str
    default_prompts: list[str]
    supported_targets: tuple[str, ...]


def normalize_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    if not normalized:
        raise ValueError("Plugin name must include at least one letter or digit.")
    if len(normalized) > 64:
        raise ValueError(
            "Plugin name must be 64 characters or fewer after normalization."
        )
    return normalized


def display_name(name: str) -> str:
    return " ".join(part.capitalize() for part in name.split("-"))


def default_metadata(raw_name: str) -> PluginMetadata:
    plugin_name = normalize_name(raw_name)
    title = display_name(plugin_name)
    return PluginMetadata(
        plugin_name=plugin_name,
        version="0.1.1",
        display_name=title,
        description=(f"{title} language hooks for Codex, Claude Code, and OpenCode."),
        author_name="Codex Language Hooks",
        short_description=f"Use {title} hooks across agentic coding tools.",
        long_description=(
            f"{title} packages language hooks for Codex, Claude Code, and OpenCode."
        ),
        developer_name="Codex Language Hooks",
        category="Development",
        brand_color="#2563EB",
        default_prompts=[],
        supported_targets=DEFAULT_TARGETS,
    )


def prompt_value(label: str, default: str, *, required: bool = True) -> str:
    while True:
        sys.stdout.write(f"{label} [{default}]: ")
        sys.stdout.flush()
        value = input().strip()
        if value:
            return value
        if default or not required:
            return default
        sys.stdout.write(f"{label} is required.\n")


def collect_metadata(raw_name: str, *, interactive: bool) -> PluginMetadata:
    metadata = default_metadata(raw_name)
    if not interactive:
        return metadata

    sys.stdout.write("Plugin metadata\n")
    display = prompt_value("Display name", metadata.display_name)
    author = prompt_value("Author name", metadata.author_name)
    developer = prompt_value("Developer name", author)
    category = prompt_value("Marketplace category", metadata.category)
    description = prompt_value("Manifest description", metadata.description)
    short_description = prompt_value("Short description", metadata.short_description)
    long_description = prompt_value("Long description", metadata.long_description)

    return PluginMetadata(
        plugin_name=metadata.plugin_name,
        version=metadata.version,
        display_name=display,
        description=description,
        author_name=author,
        short_description=short_description,
        long_description=long_description,
        developer_name=developer,
        category=category,
        brand_color=metadata.brand_color,
        default_prompts=metadata.default_prompts,
        supported_targets=metadata.supported_targets,
    )


def read_json(path: Path) -> dict[str, Any]:
    with path.open() as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def backfill_template_files(template_dir: Path, target_dir: Path) -> None:
    for template_path in template_dir.rglob("*"):
        relative_path = template_path.relative_to(template_dir)
        target_path = target_dir / relative_path

        if template_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue

        if target_path.exists():
            continue

        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(template_path, target_path)


def update_codex_plugin_manifest(plugin_dir: Path, metadata: PluginMetadata) -> None:
    manifest_path = plugin_dir / ".codex-plugin" / "plugin.json"
    manifest = read_json(manifest_path)
    manifest["name"] = metadata.plugin_name
    manifest["version"] = metadata.version
    manifest["description"] = metadata.description
    manifest["author"]["name"] = metadata.author_name
    manifest["interface"]["displayName"] = metadata.display_name
    manifest["interface"]["shortDescription"] = metadata.short_description
    manifest["interface"]["longDescription"] = metadata.long_description
    manifest["interface"]["developerName"] = metadata.developer_name
    manifest["interface"]["category"] = metadata.category
    manifest["interface"]["brandColor"] = metadata.brand_color
    manifest["interface"]["defaultPrompt"] = metadata.default_prompts
    write_json(manifest_path, manifest)


def update_claude_plugin_manifest(plugin_dir: Path, metadata: PluginMetadata) -> None:
    manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
    manifest = read_json(manifest_path)
    manifest["name"] = metadata.plugin_name
    manifest["version"] = metadata.version
    manifest["description"] = metadata.description
    manifest.setdefault("author", {})
    manifest["author"]["name"] = metadata.author_name
    write_json(manifest_path, manifest)


def update_codex_marketplace(metadata: PluginMetadata) -> None:
    marketplace = read_json(CODEX_MARKETPLACE_PATH)
    plugins = marketplace.setdefault("plugins", [])
    if not isinstance(plugins, list):
        raise ValueError("marketplace.json field 'plugins' must be an array.")
    entry = {
        "name": metadata.plugin_name,
        "source": {"source": "local", "path": f"./plugins/{metadata.plugin_name}"},
        "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
        "category": metadata.category,
    }
    for index, existing in enumerate(plugins):
        if isinstance(existing, dict) and existing.get("name") == metadata.plugin_name:
            plugins[index] = entry
            break
    else:
        plugins.append(entry)
    write_json(CODEX_MARKETPLACE_PATH, marketplace)


def update_claude_marketplace(metadata: PluginMetadata) -> None:
    marketplace = read_json(CLAUDE_MARKETPLACE_PATH)
    plugins = marketplace.setdefault("plugins", [])
    if not isinstance(plugins, list):
        raise ValueError("marketplace.json field 'plugins' must be an array.")
    entry = {
        "name": metadata.plugin_name,
        "source": f"./plugins/{metadata.plugin_name}",
        "description": metadata.description,
        "version": metadata.version,
        "author": {"name": metadata.author_name},
        "category": metadata.category.lower().replace(" ", "-"),
    }
    for index, existing in enumerate(plugins):
        if isinstance(existing, dict) and existing.get("name") == metadata.plugin_name:
            plugins[index] = entry
            break
    else:
        plugins.append(entry)
    write_json(CLAUDE_MARKETPLACE_PATH, marketplace)


def create_plugin(metadata: PluginMetadata) -> Path:
    target_dir = ROOT / "plugins" / metadata.plugin_name
    if not TEMPLATE_DIR.exists():
        raise FileNotFoundError(f"Template plugin not found: {TEMPLATE_DIR}")

    if not target_dir.exists():
        shutil.copytree(TEMPLATE_DIR, target_dir)
    else:
        backfill_template_files(TEMPLATE_DIR, target_dir)

    targets = set(metadata.supported_targets)
    if "codex" in targets:
        update_codex_plugin_manifest(target_dir, metadata)
        update_codex_marketplace(metadata)
    if "claude-code" in targets:
        update_claude_plugin_manifest(target_dir, metadata)
        update_claude_marketplace(metadata)
    if "opencode" not in targets:
        raise ValueError("OpenCode support is required for generated plugins.")
    return target_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "name",
        nargs="?",
        help="Plugin name, for example 'Python Hooks'.",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Use generated metadata defaults without prompting.",
    )
    args = parser.parse_args()
    if args.name is None:
        if args.non_interactive or not sys.stdin.isatty():
            raise SystemExit("Plugin name is required in non-interactive mode.")
        raw_name = prompt_value("Plugin name", "")
    else:
        raw_name = args.name
    metadata = collect_metadata(
        raw_name,
        interactive=sys.stdin.isatty() and not args.non_interactive,
    )
    plugin_dir = create_plugin(metadata)
    sys.stdout.write(f"{plugin_dir.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
