"""Evaluation harness: runs the labelled corpus through the real detectors and policy.

Usage (from the repository root, inside the gateway environment):

    uv run --project gateway python eval/harness.py --output eval/reports
"""

import argparse
import asyncio
import json
import statistics
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from bulwark import __version__
from bulwark.detectors.base import Detector, Direction
from bulwark.detectors.canary import CanaryDetector
from bulwark.detectors.injection import HeuristicInjectionDetector
from bulwark.detectors.pii import PiiDetector
from bulwark.detectors.secrets import SecretDetector
from bulwark.policy.evaluator import PolicyEvaluator
from bulwark.policy.loader import load_policy
from bulwark.policy.schema import PolicyAction
from bulwark.proxy.inspection import inspect_text

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CORPUS = ROOT / "eval" / "corpus" / "corpus.jsonl"
DEFAULT_POLICY = ROOT / "gateway" / "policies" / "default.yaml"

ATTACK_LABELS = ("injection", "pii", "secret", "canary")
EXPECTED_DETECTOR = {
    "injection": "injection.heuristic",
    "pii": "pii",
    "secret": "secrets",
    "canary": "canary",
}
_ACTION_RANK = {
    PolicyAction.ALLOW: 0,
    PolicyAction.LOG: 1,
    PolicyAction.REDACT: 2,
    PolicyAction.BLOCK: 3,
}


@dataclass(frozen=True, slots=True)
class Sample:
    id: str
    label: str
    direction: Direction
    text: str
    canary_token: str | None = None
    note: str | None = None


@dataclass(slots=True)
class Result:
    sample: Sample
    detectors: list[str]
    categories: list[str]
    action: str
    latency_ms: float

    @property
    def flagged(self) -> bool:
        return bool(self.detectors)

    @property
    def detected_as_expected(self) -> bool:
        return EXPECTED_DETECTOR.get(self.sample.label) in self.detectors


@dataclass(slots=True)
class CategoryMetrics:
    total: int = 0
    detected: int = 0
    enforced: int = 0
    missed: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float:
        return self.detected / self.total if self.total else 0.0


def load_corpus(path: Path) -> list[Sample]:
    samples: list[Sample] = []
    seen: set[str] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        if raw["id"] in seen:
            raise ValueError(f"duplicate sample id '{raw['id']}' on line {line_number}")
        seen.add(raw["id"])
        if raw["label"] not in (*ATTACK_LABELS, "benign"):
            raise ValueError(f"unknown label '{raw['label']}' on line {line_number}")
        samples.append(
            Sample(
                id=raw["id"],
                label=raw["label"],
                direction=Direction(raw["direction"]),
                text=raw["text"],
                canary_token=raw.get("canary_token"),
                note=raw.get("note"),
            )
        )
    return samples


def default_detectors() -> tuple[Detector, ...]:
    return (HeuristicInjectionDetector(), PiiDetector(), SecretDetector(), CanaryDetector())


async def run_sample(
    sample: Sample, detectors: tuple[Detector, ...], evaluator: PolicyEvaluator
) -> Result:
    metadata = {"canary_token": sample.canary_token} if sample.canary_token else {}
    started = time.perf_counter()
    findings = await inspect_text(
        sample.text,
        app_id="eval",
        direction=sample.direction,
        detectors=detectors,
        timeout_seconds=2.0,
        metadata=metadata,
    )
    decisions = evaluator.evaluate(findings)
    latency_ms = (time.perf_counter() - started) * 1000
    action = max((d.action for d in decisions), key=_ACTION_RANK.__getitem__, default=None)
    return Result(
        sample=sample,
        detectors=sorted({f.detector for f in findings}),
        categories=sorted({f.category for f in findings}),
        action=(action or PolicyAction.ALLOW).value,
        latency_ms=latency_ms,
    )


async def run_corpus(samples: list[Sample], policy_path: Path) -> list[Result]:
    evaluator = PolicyEvaluator(load_policy(policy_path))
    detectors = default_detectors()
    for sample in samples[:3]:  # warm up regexes and optional NLP engines
        await run_sample(sample, detectors, evaluator)
    return [await run_sample(sample, detectors, evaluator) for sample in samples]


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * fraction))]


def summarize(results: list[Result]) -> dict[str, Any]:
    categories: dict[str, CategoryMetrics] = defaultdict(CategoryMetrics)
    for result in results:
        label = result.sample.label
        if label == "benign":
            continue
        metrics = categories[label]
        metrics.total += 1
        if result.detected_as_expected:
            metrics.detected += 1
            if result.action in ("block", "redact"):
                metrics.enforced += 1
        else:
            metrics.missed.append(result.sample.id)

    benign = [r for r in results if r.sample.label == "benign"]
    false_positives = [r for r in benign if r.flagged]
    true_positives = sum(m.detected for m in categories.values())
    attacks = sum(m.total for m in categories.values())
    latencies = [r.latency_ms for r in results]
    flagged_attacks = sum(1 for r in results if r.sample.label != "benign" and r.flagged)

    return {
        "totals": {"samples": len(results), "attacks": attacks, "benign": len(benign)},
        "overall": {
            "recall": true_positives / attacks if attacks else 0.0,
            "precision": flagged_attacks / (flagged_attacks + len(false_positives))
            if flagged_attacks + len(false_positives)
            else 0.0,
            "false_positive_rate": len(false_positives) / len(benign) if benign else 0.0,
        },
        "categories": {
            label: {
                "total": m.total,
                "detected": m.detected,
                "enforced": m.enforced,
                "recall": round(m.recall, 4),
                "missed": m.missed,
            }
            for label, m in sorted(categories.items())
        },
        "false_positives": [
            {"id": r.sample.id, "detectors": r.detectors, "categories": r.categories}
            for r in false_positives
        ],
        "latency_ms": {
            "p50": round(statistics.median(latencies), 3),
            "p95": round(_percentile(latencies, 0.95), 3),
            "max": round(max(latencies), 3),
        },
    }


def render_markdown(summary: dict[str, Any], results: list[Result], policy_path: Path) -> str:
    overall = summary["overall"]
    lines = [
        f"# Bulwark evaluation report (v{__version__})",
        "",
        f"Generated {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')} · "
        f"policy `{policy_path.name}` · {summary['totals']['samples']} samples "
        f"({summary['totals']['attacks']} attack, {summary['totals']['benign']} benign).",
        "",
        "## Overall",
        "",
        f"- Recall: **{overall['recall']:.1%}**",
        f"- Precision: **{overall['precision']:.1%}**",
        f"- False-positive rate on benign traffic: **{overall['false_positive_rate']:.1%}**",
        f"- Latency per sample (ms): p50 {summary['latency_ms']['p50']}, "
        f"p95 {summary['latency_ms']['p95']}, max {summary['latency_ms']['max']}",
        "",
        "## Per category",
        "",
        "| Category | Samples | Detected | Enforced (block/redact) | Recall | Missed |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for label, m in summary["categories"].items():
        missed = ", ".join(m["missed"]) or "-"
        lines.append(
            f"| {label} | {m['total']} | {m['detected']} | {m['enforced']} | "
            f"{m['recall']:.1%} | {missed} |"
        )
    lines += ["", "## False positives", ""]
    if summary["false_positives"]:
        for item in summary["false_positives"]:
            lines.append(f"- `{item['id']}`: {', '.join(item['categories'])}")
    else:
        lines.append("None.")
    notes = [r for r in results if r.sample.note and not r.detected_as_expected]
    lines += ["", "## Known limitations observed", ""]
    if notes:
        for r in notes:
            lines.append(f"- `{r.sample.id}`: {r.sample.note}")
    else:
        lines.append("None.")
    lines += [
        "",
        "The corpus is small and hand-written; these figures are a regression baseline, "
        "not a guarantee of real-world detection rates.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    parser.add_argument("--output", type=Path, default=None, help="directory for report files")
    args = parser.parse_args()

    samples = load_corpus(args.corpus)
    results = asyncio.run(run_corpus(samples, args.policy))
    summary = summarize(results)
    markdown = render_markdown(summary, results, args.policy)
    print(markdown)
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "report.md").write_text(markdown, encoding="utf-8")
        payload = {"version": __version__, **summary, "results": [_result_dict(r) for r in results]}
        (args.output / "report.json").write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    return 0


def _result_dict(result: Result) -> dict[str, Any]:
    data = asdict(result.sample)
    data["direction"] = result.sample.direction.value
    return {
        **data,
        "detectors": result.detectors,
        "categories": result.categories,
        "action": result.action,
        "latency_ms": round(result.latency_ms, 3),
    }


if __name__ == "__main__":
    raise SystemExit(main())
