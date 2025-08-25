import type { ICloseEvent, IMessageEvent } from "websocket";
import pkg from "websocket";

// Runtime constructor
export const WebSocket = pkg.w3cwebsocket;

// Instance type
export type WebSocketInstance = InstanceType<typeof WebSocket>;

// Re-export event types
export type { ICloseEvent, IMessageEvent };
