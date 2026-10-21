# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `codelineage` CLI skeleton (`--version`, `--help`), MIT license.
- `codelineage init`: creates `.codelineage/`, registers the project, asks for git policy, Claude Code transcript retention (`cleanupPeriodDays`, with backup) and summary language; `--yes` and per-question flags for non-interactive use.
- `codelineage config get/set` and `codelineage epoch add`.
- `codelineage session write`: validates agent JSON from stdin or `--file`, redacts secret-looking values, merges into the session file under a lock.
