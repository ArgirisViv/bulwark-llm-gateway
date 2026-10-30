"""Atomic fixed-window application rate limiter backed by Redis."""

from redis.asyncio import Redis


class RateLimitExceeded(Exception):
    pass


class RateLimiter:
    def __init__(self, redis: Redis, requests_per_minute: int) -> None:
        self._redis = redis
        self._limit = requests_per_minute

    async def check(self, application_id: str) -> None:
        key = f"bulwark:ratelimit:{application_id}"
        async with self._redis.pipeline(transaction=True) as pipeline:
            pipeline.incr(key)
            pipeline.expire(key, 60, nx=True)
            result = await pipeline.execute()
        if int(result[0]) > self._limit:
            raise RateLimitExceeded
