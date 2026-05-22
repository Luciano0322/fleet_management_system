from __future__ import annotations

import asyncio
import logging
from concurrent.futures import Future

import paho.mqtt.client as mqtt

from app.config import Settings
from app.database import SessionLocal
from app.gps_ingestion import ingest_gps_message

logger = logging.getLogger(__name__)


class MqttGpsSubscriber:
    def __init__(self, settings: Settings, loop: asyncio.AbstractEventLoop) -> None:
        self.settings = settings
        self.loop = loop
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=settings.mqtt_client_id,
        )
        if settings.mqtt_username:
            self.client.username_pw_set(
                settings.mqtt_username,
                settings.mqtt_password,
            )
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def start(self) -> None:
        logger.info(
            "mqtt_gps_subscriber_starting",
            extra={
                "host": self.settings.mqtt_host,
                "port": self.settings.mqtt_port,
                "topic_filter": self.settings.mqtt_topic_filter,
            },
        )
        self.client.connect_async(
            self.settings.mqtt_host,
            self.settings.mqtt_port,
            keepalive=60,
        )
        self.client.loop_start()

    def stop(self) -> None:
        logger.info("mqtt_gps_subscriber_stopping")
        self.client.disconnect()
        self.client.loop_stop()

    def on_connect(
        self,
        client: mqtt.Client,
        _userdata,
        _flags,
        reason_code,
        _properties,
    ) -> None:
        if reason_code != 0:
            logger.error(
                "mqtt_gps_subscriber_connect_failed",
                extra={"reason_code": str(reason_code)},
            )
            return
        client.subscribe(self.settings.mqtt_topic_filter)
        logger.info(
            "mqtt_gps_subscriber_connected",
            extra={"topic_filter": self.settings.mqtt_topic_filter},
        )

    def on_message(self, _client: mqtt.Client, _userdata, message) -> None:
        future = asyncio.run_coroutine_threadsafe(
            self.handle_message(message.topic, message.payload),
            self.loop,
        )
        future.add_done_callback(self.log_message_error)

    async def handle_message(self, topic: str, payload: bytes) -> None:
        async with SessionLocal() as session:
            await ingest_gps_message(session, topic, payload)

    def log_message_error(self, future: Future) -> None:
        try:
            future.result()
        except Exception:
            logger.exception("mqtt_gps_message_handler_failed")
