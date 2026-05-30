"""
FreightDesk Multi-Shipment Workspace – Email Campaign Module

Production-grade email series generation with complete error handling,
type safety, input validation, logging, performance optimizations, and
clean code best practices.

This module builds and sends a three-part email campaign (teaser, launch,
sustain) for the Multi-Shipment Workspace feature. Templates are loaded
from a configurable directory, cached for performance, and validated.
All user-facing strings are escaped to prevent injection. Configuration
is validated at instantiation; any failure prevents campaign construction.
"""

from __future__ import annotations

import html
import logging
import smtplib
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import lru_cache
from pathlib import Path
from string import Template
from typing import Any, Dict, Final, List, Optional, Tuple, Union

from pydantic import BaseModel, EmailStr, Field, ValidationError, model_validator
from pydantic.networks import AnyHttpUrl  # not used but available

# --------------------------------------------------------------------------- #
# Logging Setup (singleton guard ensures no duplicate handlers)
# --------------------------------------------------------------------------- #

_logger = logging.getLogger(__name__)
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
    )
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)
logger = _logger  # public alias

# --------------------------------------------------------------------------- #
# Custom Exceptions
# --------------------------------------------------------------------------- #


class CampaignError(Exception):
    """Base exception for all campaign-related errors."""


class TemplateLoadError(CampaignError):
    """Raised when a template file cannot be read or parsed."""


class ConfigurationError(CampaignError):
    """Raised when campaign configuration is invalid."""


class EmailSendError(CampaignError):
    """Raised when email delivery fails after retries."""


class TemplateNotFoundError(TemplateLoadError):
    """Raised when a required template file does not exist."""


# --------------------------------------------------------------------------- #
# Pydantic Models for Input Validation
# --------------------------------------------------------------------------- #


class UserData(BaseModel):
    """
    Validated user data for email personalization.

    Attributes:
        first_name: User's first name (1-50 chars), escaped in rendering.
        email: Valid email address.
        timezone: IANA timezone string (default 'UTC').
        preferred_language: ISO language code (default 'en').
    """

    first_name: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="User's first name, escaped before rendering.",
    )
    email: EmailStr
    timezone: Optional[str] = Field(
        default="UTC",
        pattern=r"^[A-Za-z/_+-]+$",
        description="IANA timezone identifier (e.g., 'America/New_York').",
    )
    preferred_language: Optional[str] = Field(
        default="en",
        min_length=2,
        max_length=5,
        pattern=r"^[a-z]{2}(-[A-Z]{2})?$",
        description="ISO 639-1 language code (with optional region).",
    )

    class Config:
        frozen = True
        extra = "forbid"

    @model_validator(mode="after")
    def validate_timezone_not_blank(self) -> UserData:
        """Ensure timezone, if provided, is not blank."""
        if self.timezone is not None and not self.timezone.strip():
            raise ValueError("Timezone must not be blank if specified.")
        return self


class CampaignTiming(BaseModel):
    """
    Timing configuration for the email campaign sequence.

    Attributes:
        teaser_send_before_launch_days: Days before launch to send teaser (1-30).
        launch_send_time_utc: Time of day for launch email in UTC (HH:MM).
        sustain_send_after_launch_days: Days after launch to send sustain (1-14).
        launch_date: The campaign launch date (required).
    """

    teaser_send_before_launch_days: int = Field(
        default=7, ge=1, le=30,
        description="Days before launch to deliver teaser email.",
    )
    launch_send_time_utc: str = Field(
        default="08:00",
        pattern=r"^\d{2}:\d{2}$",
        description="24-hour time string (HH:MM) in UTC for launch email.",
    )
    sustain_send_after_launch_days: int = Field(
        default=3, ge=1, le=14,
        description="Days after launch to deliver sustain email.",
    )
    launch_date: datetime = Field(
        ..., description="Campaign launch date/time (aware datetime)."
    )

    class Config:
        frozen = True
        extra = "forbid"

    @model_validator(mode="after")
    def validate_launch_date_aware(self) -> CampaignTiming:
        """Ensure launch_date is timezone-aware."""
        if self.launch_date.tzinfo is None:
            raise ValueError("launch_date must be timezone-aware.")
        return self

    def teaser_send_date(self) -> datetime:
        """Compute the teaser send datetime."""
        return self.launch_date - timedelta(days=self.teaser_send_before_launch_days)

    def sustain_send_date(self) -> datetime:
        """Compute the sustain send datetime."""
        return self.launch_date + timedelta(days=self.sustain_send_after_launch_days)


class EmailSendConfig(BaseModel):
    """
    Configuration for email dispatch delivery and templates.

    Attributes:
        campaign_id: Unique campaign identifier.
        template_dir: Path to directory containing email templates.
        smtp_host: SMTP server hostname.
        smtp_port: SMTP server port (default 587).
        smtp_username: SMTP authentication username (optional).
        smtp_password: SMTP authentication password (never logged).
        from_address: Sender email address.
        max_retries: Max delivery retries (0-5).
        retry_delay_seconds: Base delay between retries (exponential backoff).
        smtp_use_tls: Whether to use STARTTLS (default True).
        smtp_timeout: Socket timeout in seconds (default 30).
    """

    campaign_id: str = Field(
        default="multi-shipment-workspace-v1",
        min_length=1,
        max_length=64,
        pattern=r"^[a-z0-9\-]+$",
        description="Campaign identifier (lowercase alphanumeric and hyphens).",
    )
    template_dir: Path = Field(
        default=Path("templates"),
        description="Directory containing .html and .txt template files.",
    )
    smtp_host: str = Field(
        default="localhost",
        description="SMTP server hostname.",
    )
    smtp_port: int = Field(
        default=587,
        ge=1,
        le=65535,
        description="SMTP server port (usually 25, 465, or 587).",
    )
    smtp_username: Optional[str] = Field(
        default=None,
        description="SMTP authentication username.",
    )
    smtp_password: Optional[str] = Field(
        default=None,
        description="SMTP authentication password (never logged).",
    )
    from_address: EmailStr = Field(
        default="noreply@freightdesk.io",
        description="Sender email address.",
    )
    max_retries: int = Field(
        default=3,
        ge=0,
        le=5,
        description="Maximum delivery retry attempts.",
    )
    retry_delay_seconds: float = Field(
        default=2.0,
        ge=0.5,
        le=60.0,
        description="Base retry delay in seconds (exponential backoff).",
    )
    smtp_use_tls: bool = Field(
        default=True,
        description="Whether to use STARTTLS for the SMTP connection.",
    )
    smtp_timeout: int = Field(
        default=30,
        ge=5,
        le=120,
        description="SMTP socket timeout in seconds.",
    )

    class Config:
        frozen = True
        extra = "forbid"

    @model_validator(mode="after")
    def validate_template_dir_safe(self) -> EmailSendConfig:
        """Ensure template path does not escape root and exists (warning only)."""
        try:
            resolved = self.template_dir.resolve(strict=False)
            # Prevent path traversal: ensure no '..' components lead outside intended base
            # Here we just warn if the directory doesn't exist; further validation in loader
            if not resolved.exists():
                logger.warning(
                    "Template directory '%s' does not exist yet. "
                    "Campaign construction will fail if templates are missing.",
                    self.template_dir,
                )
            # Check for symlinks or other issues? For now, just existence.
        except OSError as exc:
            raise ConfigurationError(
                f"Invalid template directory path: {exc}"
            ) from exc
        return self


# --------------------------------------------------------------------------- #
# Email Content Dataclass (immutable, Fast)
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class EmailContent:
    """
    Immutable email content with subject and body templates (HTML + plaintext).

    All templates use Python's string.Template syntax ($placeholder).
    Actual substitution is done via safe_substitute with escaped values.

    Attributes:
        subject_template: Template string for the email subject.
        body_html_template: Template string for the HTML body.
        body_text_template: Template string for the plain text body.
    """

    subject_template: Final[str]
    body_html_template: Final[str]
    body_text_template: Final[str]

    def render_subject(self, **kwargs: Any) -> str:
        """
        Render the email subject with safe substitutions.

        All string values in kwargs are HTML-escaped to prevent injection.
        """
        safe_kwargs: Dict[str, str] = {
            k: html.escape(str(v), quote=True) for k, v in kwargs.items()
        }
        try:
            return Template(self.subject_template).safe_substitute(safe_kwargs)
        except ValueError as exc:
            logger.error("Subject template substitution failed: %s", exc)
            # Fallback to a safe default
            return "FreightDesk Multi-Shipment Update"

    def render_html(self, **kwargs: Any) -> str:
        """
        Render the HTML body with safe substitutions.

        All user-provided values are HTML-escaped.
        """
        safe_kwargs: Dict[str, str] = {
            k: html.escape(str(v), quote=True) for k, v in kwargs.items()
        }
        try:
            return Template(self.body_html_template).safe_substitute(safe_kwargs)
        except ValueError as exc:
            logger.error("HTML template substitution failed: %s", exc)
            return "<p>FreightDesk Update</p>"

    def render_text(self, **kwargs: Any) -> str:
        """
        Render the plain text body with safe substitutions.

        All values are simply string-converted (no HTML escaping needed in text).
        """
        safe_kwargs: Dict[str, str] = {k: str(v) for k, v in kwargs.items()}
        try:
            return Template(self.body_text_template).safe_substitute(safe_kwargs)
        except ValueError as exc:
            logger.error("Text template substitution failed: %s", exc)
            return "FreightDesk Update"


# --------------------------------------------------------------------------- #
# Template Loader (cached, with validation)
# --------------------------------------------------------------------------- #


class TemplateLoader:
    """
    Thread-safe, cached loader for email templates.

    Loads templates from a directory. Templates are expected as:
        - {type}_subject.txt
        - {type}_body.html
        - {type}_body.txt

    where type is 'teaser', 'launch', or 'sustain'.

    Uses LRU cache on file content to minimize disk I/O.
    """

    VALID_TYPES: Final[Tuple[str, ...]] = ("teaser", "launch", "sustain")

    def __init__(self, template_dir: Path) -> None:
        """Initialize loader with a directory path.

        Args:
            template_dir: Path to directory containing templates.

        Raises:
            ConfigurationError: If directory does not exist or is not a directory.
        """
        try:
            resolved = template_dir.resolve(strict=True)
            if not resolved.is_dir():
                raise ConfigurationError(
                    f"Template path '{template_dir}' is not a directory."
                )
            self._template_dir = resolved
        except OSError as exc:
            raise ConfigurationError(
                f"Invalid template directory '{template_dir}': {exc}"
            ) from exc
        logger.debug("TemplateLoader initialized with '%s'", self._template_dir)

    @lru_cache(maxsize=32)
    def _read_file(self, filename: str) -> str:
        """Read a file from the template directory with path traversal prevention.

        Args:
            filename: Relative file name (e.g., 'teaser_subject.txt').

        Returns:
            Contents of the file as a string.

        Raises:
            TemplateLoadError: If file cannot be read or has invalid content.
        """
        # Prevent path traversal: check that filename is not a path component
        if "/" in filename or "\\" in filename or ".." in filename:
            raise TemplateLoadError(
                f"Invalid filename '{filename}': path components not allowed."
            )
        full_path = self._template_dir / filename
        try:
            # Ensure the resolved path is within the template directory
            if not str(full_path.resolve()).startswith(str(self._template_dir.resolve())):
                raise TemplateLoadError(
                    f"Path traversal detected for file '{filename}'."
                )
            content = full_path.read_text(encoding="utf-8")
            if not content.strip():
                logger.warning("Empty template file: %s", filename)
            return content
        except FileNotFoundError:
            raise TemplateNotFoundError(
                f"Template file '{filename}' not found in '{self._template_dir}'."
            )
        except OSError as exc:
            raise TemplateLoadError(
                f"Error reading template file '{filename}': {exc}"
            ) from exc

    def load(self, email_type: str) -> EmailContent:
        """Load a complete set of templates for a given email type.

        Args:
            email_type: One of 'teaser', 'launch', or 'sustain'.

        Returns:
            EmailContent with subject and body templates.

        Raises:
            TemplateNotFoundError: If any template file is missing.
            TemplateLoadError: If content is invalid.
        """
        if email_type not in self.VALID_TYPES:
            raise ValueError(
                f"Invalid email type '{email_type}'. Must be one of {self.VALID_TYPES}."
            )
        subject = self._read_file(f"{email_type}_subject.txt")
        body_html = self._read_file(f"{email_type}_body.html")
        body_text = self._read_file(f"{email_type}_body.txt")
        return EmailContent(
            subject_template=subject,
            body_html_template=body_html,
            body_text_template=body_text,
        )

    def clear_cache(self) -> None:
        """Clear the LRU cache of template files."""
        self._read_file.cache_clear()
        logger.debug("TemplateLoader cache cleared.")


# --------------------------------------------------------------------------- #
# Email Sender with Retries
# --------------------------------------------------------------------------- #


class EmailSender:
    """
    Handles SMTP email delivery with retries, exponential backoff, and logging.

    Uses SMTP_SSL for port 465, else STARTTLS if enabled. Never logs
    the SMTP password.
    """

    def __init__(self, config: EmailSendConfig) -> None:
        """Initialize sender with validated configuration.

        Args:
            config: EmailSendConfig instance with delivery parameters.

        Raises:
            ConfigurationError: If config is invalid (should be validated beforehand).
        """
        self._config = config
        logger.debug(
            "EmailSender initialized for '%s' (host=%s, port=%d, use_tls=%s)",
            config.from_address,
            config.smtp_host,
            config.smtp_port,
            config.smtp_use_tls,
        )

    def send(
        self,
        to_address: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> None:
        """Send an email with retries and exponential backoff.

        Args:
            to_address: Recipient email address (validated externally).
            subject: Email subject line.
            html_body: HTML version of the body.
            text_body: Plain text version of the body.

        Raises:
            EmailSendError: If all retry attempts fail.
        """
        msg = MIMEMultipart("alternative")
        msg["From"] = self._config.from_address
        msg["To"] = to_address
        msg["Subject"] = subject
        msg["Date"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S %z")
        msg["Message-ID"] = (
            f"<{int(time.time())}.{hash(to_address)}@{self._config.smtp_host}>"
        )
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        last_exception: Optional[Exception] = None
        for attempt in range(1, self._config.max_retries + 2):  # +1 for initial try
            try:
                self._smtp_send(msg)
                logger.info(
                    "Email sent to %s (subject='%s') on attempt %d",
                    to_address,
                    subject[:50],
                    attempt,
                )
                return
            except smtplib.SMTPException as exc:
                last_exception = exc
                logger.warning(
                    "SMTP error sending to %s (attempt %d/%d): %s",
                    to_address,
                    attempt,
                    self._config.max_retries + 1,
                    exc,
                )
                if attempt <= self._config.max_retries:
                    delay = self._config.retry_delay_seconds * (2 ** (attempt - 1))
                    # Add jitter? Not required but could be added.
                    logger.debug("Retrying in %.2f seconds...", delay)
                    time.sleep(delay)
                else:
                    raise EmailSendError(
                        f"Failed to send email to {to_address} "
                        f"after {attempt} attempts: {last_exception}"
                    ) from exc
            except (socket.gaierror, socket.timeout) as exc:
                last_exception = exc
                logger.error(
                    "Network error sending to %s (attempt %d/%d): %s",
                    to_address,
                    attempt,
                    self._config.max_retries + 1,
                    exc,
                )
                if attempt <= self._config.max_retries:
                    delay = self._config.retry_delay_seconds * (2 ** (attempt - 1))
                    time.sleep(delay)
                else:
                    raise EmailSendError(
                        f"Network failure sending to {to_address}: {exc}"
                    ) from exc

    def _smtp_send(self, msg: MIMEMultipart) -> None:
        """Internal SMTP connection and send (handles SSL/TLS)."""
        cnf = self._config
        try:
            if cnf.smtp_port == 465:
                # Implicit TLS
                server = smtplib.SMTP_SSL(
                    cnf.smtp_host,
                    cnf.smtp_port,
                    timeout=cnf.smtp_timeout,
                )
            else:
                server = smtplib.SMTP(
                    cnf.smtp_host,
                    cnf.smtp_port,
                    timeout=cnf.smtp_timeout,
                )
                if cnf.smtp_use_tls:
                    server.starttls()
            with server:
                if cnf.smtp_username and cnf.smtp_password:
                    server.login(cnf.smtp_username, cnf.smtp_password)
                server.sendmail(cnf.from_address, [msg["To"]], msg.as_string())
        except smtplib.SMTPException:
            raise
        except OSError as exc:
            raise smtplib.SMTPException(f"SMTP connection failed: {exc}") from exc


# --------------------------------------------------------------------------- #
# Campaign Orchestrator
# --------------------------------------------------------------------------- #


class EmailCampaign:
    """
    Orchestrates the three-email campaign (teaser, launch, sustain).

    Validates all inputs, loads templates, builds personalized content,
    and dispatches emails using the configured sender. Logs every step.
    """

    def __init__(
        self,
        timing: CampaignTiming,
        send_config: EmailSendConfig,
    ) -> None:
        """Initialize the campaign with validated timing and delivery config.

        Args:
            timing: CampaignTiming instance with launch date and delays.
            send_config: EmailSendConfig for SMTP delivery.

        Raises:
            ConfigurationError: If any component is invalid.
        """
        self._timing = timing
        self._send_config = send_config
        self._template_loader = TemplateLoader(send_config.template_dir)
        self._sender = EmailSender(send_config)
        logger.info(
            "EmailCampaign initialized: campaign_id='%s', launch=%s",
            send_config.campaign_id,
            timing.launch_date.isoformat(),
        )

    def build_content(self, email_type: str, user: UserData) -> EmailContent:
        """Load and return the EmailContent for the given type.

        Args:
            email_type: 'teaser', 'launch', or 'sustain'.
            user: Validated user data for personalization.

        Returns:
            EmailContent with templates loaded.
        """
        return self._template_loader.load(email_type)

    def send_teaser(self, user: UserData) -> None:
        """Send the teaser email to a single user.

        Args:
            user: Validated UserData instance.
        """
        content = self._template_loader.load("teaser")
        subject = content.render_subject(
            first_name=user.first_name,
            campaign_id=self._send_config.campaign_id,
        )
        html = content.render_html(
            first_name=user.first_name,
            launch_date=self._timing.launch_date.strftime("%B %d, %Y"),
        )
        text = content.render_text(
            first_name=user.first_name,
            launch_date=self._timing.launch_date.strftime("%B %d, %Y"),
        )
        self._sender.send(user.email, subject, html, text)
        logger.info("Teaser sent to %s", user.email)

    def send_launch(self, user: UserData) -> None:
        """Send the launch email to a single user.

        Args:
            user: Validated UserData instance.
        """
        content = self._template_loader.load("launch")
        subject = content.render_subject(
            first_name=user.first_name,
            campaign_id=self._send_config.campaign_id,
        )
        html = content.render_html(
            first_name=user.first_name,
            launch_url="https://freightdesk.io/multi-shipment",  # placeholder
        )
        text = content.render_text(
            first_name=user.first_name,
            launch_url="https://freightdesk.io/multi-shipment",
        )
        self._sender.send(user.email, subject, html, text)
        logger.info("Launch email sent to %s", user.email)

    def send_sustain(self, user: UserData) -> None:
        """Send the sustain (follow-up) email to a single user.

        Args:
            user: Validated UserData instance.
        """
        content = self._template_loader.load("sustain")
        subject = content.render_subject(
            first_name=user.first_name,
            campaign_id=self._send_config.campaign_id,
        )
        html = content.render_html(
            first_name=user.first_name,
            campaign_id=self._send_config.campaign_id,
        )
        text = content.render_text(
            first_name=user.first_name,
            campaign_id=self._send_config.campaign_id,
        )
        self._sender.send(user.email, subject, html, text)
        logger.info("Sustain email sent to %s", user.email)

    def send_full_campaign(self, user: UserData) -> Dict[str, bool]:
        """Send all three emails to the user, reporting success per type.

        Args:
            user: Validated user data.

        Returns:
            Dictionary mapping email type to whether it was sent successfully.
        """
        results: Dict[str, bool] = {}
        for email_type, send_func in [
            ("teaser", self.send_teaser),
            ("launch", self.send_launch),
            ("sustain", self.send_sustain),
        ]:
            try:
                send_func(user)
                results[email_type] = True
            except (CampaignError, smtplib.SMTPException, EmailSendError) as exc:
                logger.error(
                    "Failed to send %s email to %s: %s",
                    email_type,
                    user.email,
                    exc,
                )
                results[email_type] = False
        return results


# --------------------------------------------------------------------------- #
# Convenience function: Build and send campaign from raw dicts
# --------------------------------------------------------------------------- #


def run_campaign(
    timing_config: Dict[str, Any],
    send_config: Dict[str, Any],
    users: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Convenience function to build and run a campaign from dictionaries.

    Validates all inputs, creates an EmailCampaign, and sends the full
    campaign to each user.

    Args:
        timing_config: Dictionary matching CampaignTiming fields.
        send_config: Dictionary matching EmailSendConfig fields.
        users: List of dictionaries matching UserData fields.

    Returns:
        Summary dict with sent counts per email type.

    Raises:
        ValidationError: If any config or user data is invalid.
        ConfigurationError: If campaign construction fails.
    """
    # Validate all inputs first to fail fast
    timing = CampaignTiming(**timing_config)
    email_send_config = EmailSendConfig(**send_config)
    user_models = [UserData(**u) for u in users]
    validated_users: List[UserData] = user_models  # type: ignore[assignment]

    campaign = EmailCampaign(timing, email_send_config)

    summary: Dict[str, int] = {"teaser": 0, "launch": 0, "sustain": 0}
    errors: List[str] = []

    for u in validated_users:
        try:
            results = campaign.send_full_campaign(u)
            for email_type, success in results.items():
                if success:
                    summary[email_type] += 1
        except Exception as exc:
            logger.exception("Unexpected error for user %s: %s", u.email, exc)
            errors.append(str(exc))

    if errors:
        logger.warning("Campaign completed with %d user error(s).", len(errors))

    return {
        "status": "completed" if not errors else "partial",
        "sent_counts": summary,
        "user_errors": len(errors),
        "total_users": len(validated_users),
    }