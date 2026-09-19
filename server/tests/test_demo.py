from datetime import UTC, datetime, timedelta

from find_my_tracker.integrations.apple import demo

SATURDAY = datetime(2026, 9, 19, 15, 30, tzinfo=UTC)  # the Haarlem day trip


def test_reports_are_the_same_on_every_poll() -> None:
    since = SATURDAY - timedelta(hours=6)
    assert demo.reports("DEMO-KEYS", SATURDAY, since) == demo.reports("DEMO-KEYS", SATURDAY, since)


def test_beacons_follow_the_routine() -> None:
    home = demo.position("DEMO-KEYS", SATURDAY.replace(hour=2))
    haarlem = demo.position("DEMO-KEYS", SATURDAY.replace(hour=14))
    bike = demo.position("DEMO-BIKE", SATURDAY.replace(hour=14))
    suitcase_in_lisbon = demo.position("DEMO-SUITCASE", datetime(2026, 9, 12, 12, tzinfo=UTC))
    assert home and haarlem and bike and suitcase_in_lisbon
    assert home[0][1] > 4.85  # Amsterdam
    assert haarlem[0][1] < 4.7  # Haarlem
    assert abs(bike[0][0] - 52.379) < 0.001  # parked at Centraal
    assert suitcase_in_lisbon[0][0] < 39


def test_no_reports_in_the_air() -> None:
    assert demo.position("DEMO-SUITCASE", datetime(2026, 9, 11, 7, 30, tzinfo=UTC)) is None


def test_two_weeks_of_history() -> None:
    reports = demo.reports("DEMO-BACKPACK", SATURDAY, SATURDAY - demo.HISTORY)
    assert len(reports) > 500
    assert all(SATURDAY - demo.HISTORY <= r.observed_at <= SATURDAY for r in reports)
