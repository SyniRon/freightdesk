"""
Multi-Shipment Workspace Campaign Manager for FreightDesk.

Encapsulates validated tweet/post templates as immutable data structures
with complete error handling, logging, and validation. Designed for
production publishing pipelines with support for scheduling, media
attachments, and placeholders.

Exports:
    - CampaignPhase
    - TweetCategory
    - MediaAttachment
    - TweetTemplate
    - ValidationError hierarchy
    - Convenience constants
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from enum import Enum, auto
from typing import Any, Dict, Optional, Sequence, Tuple
from dataclasses import dataclass, field
from functools import lru_cache
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("freightdesk.campaign.multi_shipment")

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
__all__ = [
    "CampaignPhase",
    "TweetCategory",
    "MediaAttachment",
    "TweetTemplate",
    "ValidationError",
    "ContentTooLongError",
    "InvalidHashtagError",
    "InvalidURLError",
    "InvalidMediaTypeError",
    "BlacklistedContentError",
    "PastSchedulingError",
    "MAX_TWEET_LENGTH",
    "MAX_TWEET_LENGTH_PREMIUM",
    "MAX_HASHTAGS",
    "MAX_LINKS",
    "MAX_MEDIA_COUNT",
    "VALID_MEDIA_TYPES",
    "BLACKLIST_WORDS",
]

# ---------------------------------------------------------------------------
# Constants – rules and limits
# ---------------------------------------------------------------------------
MAX_TWEET_LENGTH: int = 280
MAX_TWEET_LENGTH_PREMIUM: int = 25_000
MAX_HASHTAGS: int = 10
MAX_LINKS: int = 4
MAX_MEDIA_COUNT: int = 4
MAX_ALT_TEXT_LENGTH: int = 1000

# Hashtag: starts with '#', then letter, then up to 139 word chars
HASHTAG_PATTERN: re.Pattern = re.compile(r"^#[A-Za-z]\w{0,139}$")
# Loose URL pattern (t.co will shorten, but we validate format)
URL_PATTERN: re.Pattern = re.compile(
    r"https?://[^\s/$.?#].[^\s]*", re.IGNORECASE
)
# Words that should never appear in tweet content
BLACKLIST_WORDS: frozenset = frozenset(
    ["scam", "phish", "exploit", "ponzi", "mlm", "bait"]
)

# Supported media MIME types (Twitter/X public API list)
VALID_MEDIA_TYPES: frozenset = frozenset(
    {"image/gif", "image/png", "image/jpeg", "video/mp4"}
)

# Placeholder pattern (e.g., {variable_name})
PLACEHOLDER_PATTERN: re.Pattern = re.compile(r"\{[A-Za-z_]\w*\}")

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class CampaignPhase(Enum):
    """Timeline phase of the campaign."""
    PRE_LAUNCH = auto()
    LAUNCH = auto()
    SUSTAIN = auto()
    WRAP_UP = auto()


class TweetCategory(Enum):
    """Semantic category of the post."""
    TEASER = auto()
    ANNOUNCEMENT = auto()
    DEEP_DIVE = auto()
    USE_CASE = auto()
    TIPS = auto()
    COMMUNITY = auto()
    TESTIMONIAL = auto()
    EDUCATION = auto()
    REMINDER = auto()
    AB_TEST = auto()
    WRAP_UP = auto()


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------
class ValidationError(Exception):
    """Base for all validation errors in tweet template construction."""
    pass


class ContentTooLongError(ValidationError):
    """Tweet content exceeds the allowed character limit."""
    def __init__(self, length: int, max_length: int) -> None:
        self.length = length
        self.max_length = max_length
        super().__init__(f"Content length {length} exceeds max {max_length}")


class InvalidHashtagError(ValidationError):
    """Hashtag does not conform to expected format."""
    def __init__(self, hashtag: str, detail: str = "") -> None:
        self.hashtag = hashtag
        self.detail = detail
        msg = f"Invalid hashtag: {hashtag!r}"
        if detail:
            msg += f" – {detail}"
        super().__init__(msg)


class InvalidURLError(ValidationError):
    """URL does not conform to expected format."""
    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(f"Invalid URL: {url!r}")


class InvalidMediaTypeError(ValidationError):
    """Media MIME type is not supported."""
    def __init__(self, media_type: str) -> None:
        self.media_type = media_type
        super().__init__(f"Unsupported media type: {media_type}")


class BlacklistedContentError(ValidationError):
    """Content contains disallowed words."""
    def __init__(self, words: Sequence[str]) -> None:
        self.found_words = words
        super().__init__(f"Blacklisted words found: {', '.join(words)}")


class PastSchedulingError(ValidationError):
    """Scheduled time must be in the future."""
    def __init__(self, scheduled: datetime) -> None:
        self.scheduled_time = scheduled
        super().__init__(f"Scheduled time {scheduled.isoformat()} is in the past")


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
@dataclass(frozen=True, order=True)
class MediaAttachment:
    """Represents an optional media file to attach to the tweet.

    Attributes:
        type: Media MIME type (validated against VALID_MEDIA_TYPES).
        url: Public URL or file path to the media.
        alt_text: Accessibility description (optional, max 1000 chars).
    """
    type: str
    url: str
    alt_text: str = ""

    def __post_init__(self) -> None:
        # Validate media type
        if self.type not in VALID_MEDIA_TYPES:
            raise InvalidMediaTypeError(self.type)

        # Validate URL format (supports http/https only)
        if not URL_PATTERN.match(self.url):
            raise InvalidURLError(self.url)

        # Validate URL structure more thoroughly
        try:
            parsed = urlparse(self.url)
            if parsed.scheme not in ('http', 'https') or not parsed.netloc:
                raise ValueError("Missing scheme or netloc")
        except Exception as e:
            raise InvalidURLError(self.url) from e

        # Alt text limit (Twitter recommends max 1000 characters)
        if len(self.alt_text) > MAX_ALT_TEXT_LENGTH:
            raise ValidationError(
                f"alt_text exceeds {MAX_ALT_TEXT_LENGTH} characters: "
                f"{len(self.alt_text)}"
            )

        # Log successful creation for audit
        logger.debug("MediaAttachment created: %s", self)

    def __str__(self) -> str:
        return f"MediaAttachment({self.type}, {self.url})"

    def __repr__(self) -> str:
        return (
            f"MediaAttachment(type={self.type!r}, url={self.url!r}, "
            f"alt_text={self.alt_text!r})"
        )


@dataclass(frozen=True, order=True)
class TweetTemplate:
    """
    Immutable representation of a scheduled tweet.

    Every field is validated on construction. The template supports
    placeholders in the form ``{variable}`` which can be substituted
    via the :meth:`format` method.

    Attributes:
        phase: Campaign phase (pre-launch, launch, sustain, wrap-up).
        week: Relative week number (1‑based, within a campaign).
        number: Sequence number within the phase (for ordering).
        category: Semantic category of the tweet.
        content: Main tweet text (may include placeholders ``{...}``).
        hashtags: Ordered tuple of hashtags (including ``#`` prefix).
        media: Optional tuple of :class:`MediaAttachment` instances.
        links: Optional tuple of display URLs.
        scheduled_time: Optional datetime for posting; if None, to be determined.
        metadata: Arbitrary key‑value store (e.g., UTM tags).
        max_length: Character limit for this account (default = 280).
    """
    phase: CampaignPhase
    week: int
    number: int
    category: TweetCategory
    content: str
    hashtags: Tuple[str, ...] = field(default_factory=tuple)
    media: Tuple[MediaAttachment, ...] = field(default_factory=tuple)
    links: Tuple[str, ...] = field(default_factory=tuple)
    scheduled_time: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    max_length: int = MAX_TWEET_LENGTH

    def __post_init__(self) -> None:
        """Validate all fields after dataclass initialization."""
        errors: list[str] = []

        # Phase must be a valid CampaignPhase
        if not isinstance(self.phase, CampaignPhase):
            errors.append(f"phase must be CampaignPhase, got {type(self.phase).__name__}")

        # Week must be positive integer
        if not isinstance(self.week, int) or self.week < 1:
            errors.append(f"week must be a positive integer, got {self.week!r}")

        # Number must be non-negative integer
        if not isinstance(self.number, int) or self.number < 0:
            errors.append(f"number must be a non-negative integer, got {self.number!r}")

        # Category must be a valid TweetCategory
        if not isinstance(self.category, TweetCategory):
            errors.append(f"category must be TweetCategory, got {type(self.category).__name__}")

        # Content validation
        if not isinstance(self.content, str) or not self.content.strip():
            errors.append("content must be a non-empty string")

        # Length check
        if len(self.content) > self.max_length:
            raise ContentTooLongError(len(self.content), self.max_length)

        # Hashtag validation
        if len(self.hashtags) > MAX_HASHTAGS:
            errors.append(f"hashtags exceed maximum {MAX_HASHTAGS}")
        for ht in self.hashtags:
            if not isinstance(ht, str):
                errors.append(f"hashtag must be string, got {type(ht).__name__}")
                continue
            if not HASHTAG_PATTERN.fullmatch(ht):
                errors.append(f"Invalid hashtag format: {ht!r}")

        # Media count
        if len(self.media) > MAX_MEDIA_COUNT:
            errors.append(f"media count exceeds maximum {MAX_MEDIA_COUNT}")

        # Links count
        if len(self.links) > MAX_LINKS:
            errors.append(f"links count exceeds maximum {MAX_LINKS}")
        for link in self.links:
            if not isinstance(link, str) or not URL_PATTERN.fullmatch(link):
                errors.append(f"Invalid link URL: {link!r}")

        # Blacklisted content check
        content_lower = self.content.lower()
        found = [word for word in BLACKLIST_WORDS if word in content_lower]
        if found:
            raise BlacklistedContentError(found)

        # Scheduled time in future
        if self.scheduled_time is not None:
            if not isinstance(self.scheduled_time, datetime):
                errors.append("scheduled_time must be a datetime object")
            elif self.scheduled_time.tzinfo is None:
                # Assume UTC if naive
                now = datetime.now(timezone.utc)
                scheduled_utc = self.scheduled_time.replace(tzinfo=timezone.utc)
                if scheduled_utc <= now:
                    raise PastSchedulingError(self.scheduled_time)
            else:
                if self.scheduled_time <= datetime.now(timezone.utc):
                    raise PastSchedulingError(self.scheduled_time)

        # Metadata type
        if not isinstance(self.metadata, dict):
            errors.append("metadata must be a dictionary")

        if errors:
            raise ValidationError("; ".join(errors))

        logger.debug("TweetTemplate created: %s", self)

    def format(self, **context: Any) -> "TweetTemplate":
        """
        Substitute placeholders in the content with provided values.

        Args:
            **context: Mapping of placeholder names (without braces) to values.

        Returns:
            A new TweetTemplate instance with substituted content.

        Raises:
            ValidationError: If a placeholder is not provided or substitution
                would produce invalid content.
        """
        # Validate that all placeholders have a mapping
        placeholders = PLACEHOLDER_PATTERN.findall(self.content)
        missing = [
            ph[1:-1] for ph in placeholders if ph[1:-1] not in context
        ]
        if missing:
            raise ValidationError(
                f"Missing values for placeholders: {', '.join(missing)}"
            )

        # Substitute
        new_content = self.content.format(**context)

        # Create new instance (validation will re-run)
        return TweetTemplate(
            phase=self.phase,
            week=self.week,
            number=self.number,
            category=self.category,
            content=new_content,
            hashtags=self.hashtags,
            media=self.media,
            links=self.links,
            scheduled_time=self.scheduled_time,
            metadata=self.metadata,
            max_length=self.max_length,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary (useful for serialization)."""
        return {
            "phase": self.phase.name,
            "week": self.week,
            "number": self.number,
            "category": self.category.name,
            "content": self.content,
            "hashtags": list(self.hashtags),
            "media": [m.to_dict() for m in self.media],
            "links": list(self.links),
            "scheduled_time": self.scheduled_time.isoformat() if self.scheduled_time else None,
            "metadata": dict(self.metadata),
            "max_length": self.max_length,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TweetTemplate":
        """Create a TweetTemplate from a dictionary (deserialization)."""
        # Convert enums and nested objects
        phase = CampaignPhase[data["phase"]]
        category = TweetCategory[data["category"]]
        media = tuple(
            MediaAttachment(type=m["type"], url=m["url"], alt_text=m.get("alt_text", ""))
            for m in data.get("media", [])
        )
        hashtags = tuple(data.get("hashtags", []))
        links = tuple(data.get("links", []))
        scheduled = data.get("scheduled_time")
        if scheduled:
            scheduled = datetime.fromisoformat(scheduled)
        metadata = data.get("metadata", {})
        return cls(
            phase=phase,
            week=data["week"],
            number=data["number"],
            category=category,
            content=data["content"],
            hashtags=hashtags,
            media=media,
            links=links,
            scheduled_time=scheduled,
            metadata=metadata,
            max_length=data.get("max_length", MAX_TWEET_LENGTH),
        )

    def __str__(self) -> str:
        return f"TweetTemplate(phase={self.phase.name}, week={self.week}, number={self.number})"

    def __repr__(self) -> str:
        return (
            f"TweetTemplate(phase={self.phase!r}, week={self.week!r}, "
            f"number={self.number!r}, category={self.category!r}, "
            f"content={self.content!r}, hashtags={self.hashtags!r}, "
            f"media={self.media!r}, links={self.links!r}, "
            f"scheduled_time={self.scheduled_time!r}, "
            f"metadata={self.metadata!r}, max_length={self.max_length!r})"
        )


# Add to_dict to MediaAttachment for serialization
def _media_to_dict(self) -> Dict[str, Any]:
    return {
        "type": self.type,
        "url": self.url,
        "alt_text": self.alt_text,
    }

MediaAttachment.to_dict = _media_to_dict

# ---------------------------------------------------------------------------
# Convenience factory function (optional)
# ---------------------------------------------------------------------------
def create_template(
    phase: CampaignPhase,
    week: int,
    number: int,
    category: TweetCategory,
    content: str,
    **kwargs: Any,
) -> TweetTemplate:
    """
    Quick factory with defaults.
    """
    return TweetTemplate(
        phase=phase,
        week=week,
        number=number,
        category=category,
        content=content,
        **kwargs,
    )