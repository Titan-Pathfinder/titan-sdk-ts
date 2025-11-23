import { createServer } from "http";
import { env } from "node:process";
import pkg from "websocket";

// Destructure server and client from websocket package
// (CommonJS modules require this pattern for ES module imports)
const { server: WebSocketServer, client: WebSocketClient } = pkg;

// Middleware Proxy Example
// This server acts as a proxy between browser clients and the Titan API,
// keeping the API key secure on the server side.
//
// Set the following environment variables:
// - TITAN_WS_URL  : Titan API WebSocket URL (e.g., wss://api.titan.io/v1/ws)
// - TITAN_API_KEY : Your Titan API key
// - PORT          : Server port (default: 3000)

// Load configuration from environment variables
const PORT = parseInt(env["PORT"] || "3000");
const TITAN_WS_URL = env["TITAN_WS_URL"];
const TITAN_API_KEY = env["TITAN_API_KEY"];

// Validate required environment variables
if (!TITAN_WS_URL || !TITAN_API_KEY) {
	console.error("Missing required environment variables: TITAN_WS_URL, TITAN_API_KEY");
	process.exit(1);
}

// Titan API sub-protocols (for compression negotiation)
const TITAN_SUBPROTOCOLS = [
	"v1.api.titan.ag+zstd",
	"v1.api.titan.ag+brotli",
	"v1.api.titan.ag+gzip",
	"v1.api.titan.ag",
];

// Create HTTP server
const httpServer = createServer((req, res) => {
	// Health check endpoint
	if (req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}
	res.writeHead(404);
	res.end();
});

// Create WebSocket server
const wsServer = new WebSocketServer({ httpServer });

/**
 * Validate user token before allowing proxy access.
 * Replace with your actual authentication logic.
 */
function validateUserToken(token: string | null): boolean {
	if (!token) return false;
	// TODO: Implement your validation (JWT verify, session lookup, etc.)
	return token.length > 0;
}

// Handle WebSocket requests
wsServer.on("request", (request) => {
	// Check if this is a request to our proxy path
	if (!request.resource.startsWith("/titan-proxy")) {
		request.reject(404, "Not Found");
		return;
	}

	// Extract user token from query string
	const url = new URL(request.resource, `http://localhost:${PORT}`);
	const token = url.searchParams.get("token");

	// Reject unauthorized connections
	if (!validateUserToken(token)) {
		console.log("Unauthorized connection attempt from:", request.remoteAddress);
		request.reject(401, "Unauthorized");
		return;
	}

	// Select sub-protocol
	const requestedProtocols = request.requestedProtocols;
	let selectedProtocol: string | null = null;
	for (const proto of requestedProtocols) {
		if (TITAN_SUBPROTOCOLS.includes(proto)) {
			selectedProtocol = proto;
			break;
		}
	}

	if (!selectedProtocol && requestedProtocols.length > 0) {
		request.reject(400, "Unsupported sub-protocol");
		return;
	}

	// Accept the connection
	const clientConnection = request.accept(selectedProtocol, request.origin);
	console.log("Client connected from:", request.remoteAddress);
	console.log("Selected sub-protocol:", selectedProtocol || "none");

	// Connect to Titan API
	const titanClient = new WebSocketClient();
	let titanConnection: ReturnType<typeof request.accept> | null = null;
	let titanConnected = false;
	const messageQueue: Buffer[] = [];

	titanClient.on("connect", (connection) => {
		console.log("Connected to Titan API");
		titanConnection = connection;
		titanConnected = true;

		// Send any queued messages
		messageQueue.forEach((msg) => connection.sendBytes(msg));
		messageQueue.length = 0;

		// Forward Titan API responses to browser client
		connection.on("message", (message) => {
			if (clientConnection.connected) {
				if (message.type === "binary" && message.binaryData) {
					clientConnection.sendBytes(message.binaryData);
				} else if (message.type === "utf8" && message.utf8Data) {
					clientConnection.sendUTF(message.utf8Data);
				}
			}
		});

		// Handle Titan connection close
		connection.on("close", (code, description) => {
			console.log("Titan connection closed:", code, description);
			if (clientConnection.connected) {
				clientConnection.close(code, description);
			}
		});

		// Handle Titan connection errors
		connection.on("error", (err) => {
			console.error("Titan WebSocket error:", err.message);
			if (clientConnection.connected) {
				clientConnection.close(1011, "Upstream error");
			}
		});
	});

	titanClient.on("connectFailed", (err) => {
		console.error("Failed to connect to Titan API:", err.message);
		if (clientConnection.connected) {
			clientConnection.close(1011, "Failed to connect to upstream");
		}
	});

	// Connect to Titan with API key and sub-protocol
	titanClient.connect(
		`${TITAN_WS_URL}?auth=${TITAN_API_KEY}`,
		selectedProtocol ? [selectedProtocol] : undefined
	);

	// --- Browser client event handlers ---

	// Forward browser client messages to Titan API
	clientConnection.on("message", (message) => {
		const data = message.type === "binary" ? message.binaryData : Buffer.from(message.utf8Data || "");
		if (titanConnected && titanConnection) {
			titanConnection.sendBytes(data!);
		} else {
			// Queue messages until Titan connection is ready
			messageQueue.push(data!);
		}
	});

	// Clean up Titan connection when browser disconnects
	clientConnection.on("close", (code, description) => {
		console.log("Client disconnected:", code, description);
		if (titanConnection && titanConnection.connected) {
			titanConnection.close();
		}
	});

	// Handle browser client errors
	clientConnection.on("error", (err) => {
		console.error("Client WebSocket error:", err.message);
		if (titanConnection && titanConnection.connected) {
			titanConnection.close();
		}
	});
});

// Start the proxy server
httpServer.listen(PORT, () => {
	console.log(`Middleware proxy running on port ${PORT}`);
	console.log(`WebSocket endpoint: ws://localhost:${PORT}/titan-proxy`);
	console.log("");
	console.log("Browser clients can connect with:");
	console.log(`  ws://localhost:${PORT}/titan-proxy?token=USER_TOKEN`);
});
