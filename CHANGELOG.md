# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-22

### Added

- A **Komga** device: online, libraries, series, books, series in progress,
  books read today, version (administrator account).
- Scene triggers: new series added (filter: library), new book of a series
  already in Komga (filter: series title), series read to the end (filter:
  library).
- Scene actions: scan the Komga libraries (one by name, or all; administrator
  account), and read the latest additions as a sentence for a notification or
  a speaker.
- Dashboard widgets: **Recently added** (cover grid, series and book counts, a
  button to scan the libraries) and **Keep reading** (books in progress with
  their covers and progress, books read today).
- An API key (Komga 1.12 and later), or the e-mail and password of the
  account for older servers.
- The events of Komga bring the next reading forward: a new book or a reading
  reaches Gladys within seconds.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-komga/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-komga/releases/tag/v1.0.0
