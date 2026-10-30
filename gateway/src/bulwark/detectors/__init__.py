"""Detector plugins. Detectors only report findings; the policy engine decides."""

from bulwark.detectors.base import Detector
from bulwark.detectors.canary import CanaryDetector
from bulwark.detectors.injection import HeuristicInjectionDetector
from bulwark.detectors.pii import PiiDetector
from bulwark.detectors.secrets import SecretDetector

__all__ = [
    "CanaryDetector",
    "Detector",
    "HeuristicInjectionDetector",
    "PiiDetector",
    "SecretDetector",
]
