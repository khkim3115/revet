# Clean-room policy

This project contains no code, rules, or identifiers derived from any
client codebase. Rule packs encode only publicly documented language and
platform constraints (e.g. PHP 5 syntax limits, EUC-KR encoding behavior).

Enforced by `npm run lint:cleanroom`, which fails on forbidden identifiers.
