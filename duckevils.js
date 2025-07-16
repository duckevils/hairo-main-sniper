const tls = require("tls")
const http2 = require("http2")
const events = require("events")
const WebSocket = require("ws")
const colors = require("colors")
const fs = require("fs")
const path = require("path")
const https = require("https")
const extractJsonFromString = require("extract-json-from-string")
const configPath = path.join(process.cwd(), "config.json")
const {token, serverId, password, webhookURL, socketCount} = JSON.parse(fs.readFileSync(configPath, "utf8"))
// aptal gpt kodlarınızı sikeris XD
const guilds = {}
let mfaToken = null
const sessionCache = new Map()
process.setMaxListeners(0)
events.EventEmitter.defaultMaxListeners = 0
const HEARTBEAT = Buffer.from('{"op":1,"d":{}}')
const IDENTIFY = Buffer.from(
    JSON.stringify({
        op: 2,
        d: {
            token: token,
            intents: 1,
            properties: {os: "linux", browser: "hairo"},
            guild_subscriptions: false,
            large_threshold: 0
        }
    })
)
let vanity

let tlsSocket = null
async function basla() {
    async function connectTLS(port) {
        tlsSocket = tls.connect({
            host: "canary.discord.com",
            port,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.2",
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined,
            servername: "canary.discord.com",
            keepAlive: true,
            session: sessionCache.get("canary.discord.com")
        })
        tlsSocket.setNoDelay(true)
        tlsSocket.setKeepAlive(true, 10000)
        tlsSocket.setMaxListeners(0)
        tlsSocket.setEncoding("latin1")

        tlsSocket.on("error", (err) => {
            tlsSocket?.destroy()
        })

        tlsSocket.on("close", () => {
            const nextPort = port === 8443 ? 443 : 8443
            setTimeout(() => connectTLS(nextPort), 950)
        })
        tlsSocket.on("data", (data) => {
            handleData(data)
        })

        tlsSocket.on("end", () => {
            tlsSocket?.destroy()
        })

        tlsSocket.on("session", (session) => {
            sessionCache.set("canary.discord.com", session)
        })
    }
    function handleData(data) {
        const ext = extractJsonFromString(data.toString())
        const find = ext.find((e) => e.code || e.message)
        if (find) {
            notifyWebhook(find)
        } else {
        }
    }
    async function notifyWebhook(find) {
        const requestBody = {
            content: `*${vanity}* @everyone`,
            username: "hairo never got fail",
            avatar_url:
          "https://cdn.discordapp.com/attachments/1378679960046272633/1395174058974249010/9fbbf41d277236641b3f5e710134709c_-_Kopya.jpg?ex=68797c98&is=68782b18&hm=df1cad0521f981fbeabe5cad34540a72ce551a8b16ade584b1a79a229eeb3c6b&",
            embeds: [
                {
                    title: "Vanity Sniper",
                    description: `\`\`\`${JSON.stringify(find)}\`\`\``,
                    color: 0x000000,
                    fields: [
                        {
                            name: "Vanity URL",
                            value: `\`${vanity}\``,
                            inline: true
                        },
                        {
                            name: "Guild ID",
                            value: `\`${serverId}\``,
                            inline: true
                        }
                    ],
                    footer: {
                        text: `https://t.me/hairo4k | ${new Date().toLocaleString("tr-TR", {hour12: false})}`,
                        icon_url: "https://cdn.discordapp.com/attachments/1378679960046272633/1395174058974249010/9fbbf41d277236641b3f5e710134709c_-_Kopya.jpg?ex=68797c98&is=68782b18&hm=df1cad0521f981fbeabe5cad34540a72ce551a8b16ade584b1a79a229eeb3c6b&"
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        }

        try {
            await fetch(webhookURL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody)
            })
        } catch (error) {}
    }

    function connectWebSocket() {
        let websocket = null
        let reconnecting = false
        let heartbeat = null
        const HEARTBEAT_INTERVAL = 41250
        const CONNECTION_LIFETIME = 900000

        const start = () => {
            try {
                const identifyPayload = Buffer.from(IDENTIFY)
                const heartbeatPayload = Buffer.from(HEARTBEAT)
                const websocket = new WebSocket("wss://gateway-us-east1-b.discord.gg", {
                    perMessageDeflate: false,
                    autoPong: true,
                    skipUTF8Validation: true,
                    followRedirects: false,
                    rejectUnauthorized: false,
                    maxRedirects: 0
                })

                websocket.onopen = () => {
                    websocket.send(identifyPayload, {binary: false}, (err) => {
                        if (err) setImmediate(reconnect)
                    })

                    heartbeat = setInterval(() => {
                        if (websocket.readyState !== WebSocket.OPEN) {
                            setImmediate(reconnect)
                            return
                        }

                        websocket.send(heartbeatPayload, {binary: false}, (err) => {
                            if (err) setImmediate(reconnect)
                        })
                    }, HEARTBEAT_INTERVAL)

                    heartbeat.unref()
                }

                websocket.onmessage = ({data}) => {
                    const {d, t} = JSON.parse(data)
                    if (t === "GUILD_UPDATE") {
                        const guildId = d.guild_id || d.id
                        const find = guilds[guildId]
                        if (find && find !== d.vanity_url_code) {
                            vanity = find
                            const body = `{"code":"${find}"}`
                            console.log(colors.red(`UPDATE: ${find} ON ${guildId} / ${new Date().toLocaleString("tr-TR", {hour12: false})}`))
                            void tlsSocket.write([`PATCH /api/v10/guilds/${serverId}/vanity-url HTTP/1.1`,`Host: canary.discord.com`, `X-Discord-MFA-Authorization: ${mfaToken}`,`Content-Length: ${body.length}`,`Authorization: ${token}`,`Content-Type: application/json`,`User-Agent: 0`,`X-Super-Properties: eyJvcyI6IkFuZHJvaWQiLCJicm93c2VyIjoiQW5kcm9pZCBDaHJvbWUiLCJkZXZpY2UiOiJBbmRyb2lkIiwic3lzdGVtX2xvY2FsZSI6InRyLVRSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDYuMDsgTmV4dXMgNSBCdWlsZC9NUkE1OE4pIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMzEuMC4wLjAgTW9iaWxlIFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMzEuMC4wLjAiLCJvc192ZXJzaW9uIjoiNi4wIiwicmVmZXJyZXIiOiJodHRwczovL2Rpc2NvcmQuY29tL2NoYW5uZWxzL0BtZS8xMzAzMDQ1MDIyNjQzNTIzNjU1IiwicmVmZXJyaW5nX2RvbWFpbiI6ImRpc2NvcmQuY29tIiwicmVmZXJyaW5nX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTU2MjQsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9=`,'', body].join('\r\n'));      
                            void tlsSocket.write([`PATCH /api/v10/guilds/${serverId}/vanity-url HTTP/1.1`,`Host: canary.discord.com`, `X-Discord-MFA-Authorization: ${mfaToken}`,`Content-Length: ${body.length}`,`Authorization: ${token}`,`Content-Type: application/json`,`User-Agent: 0`,`X-Super-Properties: eyJvcyI6IkFuZHJvaWQiLCJicm93c2VyIjoiQW5kcm9pZCBDaHJvbWUiLCJkZXZpY2UiOiJBbmRyb2lkIiwic3lzdGVtX2xvY2FsZSI6InRyLVRSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDYuMDsgTmV4dXMgNSBCdWlsZC9NUkE1OE4pIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMzEuMC4wLjAgTW9iaWxlIFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMzEuMC4wLjAiLCJvc192ZXJzaW9uIjoiNi4wIiwicmVmZXJyZXIiOiJodHRwczovL2Rpc2NvcmQuY29tL2NoYW5uZWxzL0BtZS8xMzAzMDQ1MDIyNjQzNTIzNjU1IiwicmVmZXJyaW5nX2RvbWFpbiI6ImRpc2NvcmQuY29tIiwicmVmZXJyaW5nX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTU2MjQsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9=`,'', body].join('\r\n'));      

                            }
                    } else if (t === "READY") {
                        d.guilds
                            .filter((g) => g.vanity_url_code)
                            .forEach((g) => (guilds[g.id] = g.vanity_url_code))
                        console.log(
                            JSON.stringify(Object.fromEntries(Object.entries(guilds)), null, 2)
                        )
                        console.log(`[WS] Websocket initialized => ${d.user.username}, Guilds Size => ${d.guilds.length}`)
                    }
                }
                websocket.onclose = () => setImmediate(reconnect)
                setTimeout(() => {
                    if (websocket?.readyState === WebSocket.OPEN) {
                        clearInterval(heartbeat)
                    }
                }, CONNECTION_LIFETIME).unref()
            } catch (error) {
                reconnecting = false
                reconnect()
            }
        }

        const reconnect = () => {
            if (reconnecting) return
            reconnecting = true

            clearInterval(heartbeat)
            websocket?.close?.(1000)

            setTimeout(() => {
                reconnecting = false
                start()
            }, 3000)
        }

        start()
    }

  setInterval(
    () => tlsSocket.write(["HEAD / HTTP/1.1", "Host: canary.discord.com", "", ""].join("\r\n")),
    15000
  )
  setInterval(
    () =>
      tlsSocket.write(
        ["HEAD /api/v9/gateway HTTP/1.1", "Host: canary.discord.com", "", ""].join("\r\n")
      ),
    10000
  )
  const headers = {
  'Authorization': token,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) client/1.0.1130 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
  'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRGlzY29yZCBDbGllbnQiLCJyZWxlYXNlX2NoYW5uZWwiOiJwdGIiLCJjbGllbnRfdmVyc2lvbiI6IjEuMC4xMTMwIiwib3NfdmVyc2lvbiI6IjEwLjAuMTkwNDUiLCJvc19hcmNoIjoieDY0IiwiYXBwX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoidHIiLCJoYXNfY2xpZW50X21vZHMiOmZhbHNlLCJicm93c2VyX3VzZXJfYWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBkaXNjb3JkLzEuMC4xMTMwIENocm9tZS8xMjguMC42NjEzLjE4NiBFbGVjdHJvbi8zMi4yLjcgU2FmYXJpLzUzNy4zNiIsImJyb3dzZXJfdmVyc2lvbiI6IjMyLjIuNyIsIm9zX3Nka192ZXJzaW9uIjoiMTkwNDUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNjY5NTUsIm5hdGl2ZV9idWlsZF9udW1iZXIiOjU4NDYzLCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsfQ=='
};

class Client {
  constructor() {
    this.session = null;
    this.isConnecting = false;
    this.createSession();
  }

  createSession() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    if (this.session) this.session.destroy();

    this.session = http2.connect('https://canary.discord.com', {
      settings: { enablePush: false, noDelay: true, keepAlive: true, rejectUnauthorized: false, session: sessionCache.get('canary.discord.com'), zeroRtt: true, handshakeTimeout: 0 },
      secureContext: tls.createSecureContext({ ciphers: 'ECDHE-RSA-AES128-GCM-SHA256' }),
    });

    this.session.on('error', () => setTimeout(() => this.createSession(), 5000));
    this.session.on('connect', () => this.isConnecting = false);
    this.session.on('close', () => { this.isConnecting = false; setTimeout(() => this.createSession(), 5000); });
  }

  async request(method, path, customHeaders = {}, body = null) {
    if (!this.session || this.session.destroyed) await new Promise(res => setTimeout(res, 1));
    const stream = this.session.request({ ":method": method, ":path": path, ":authority": "canary.discord.com", ...headers, ...customHeaders });
    const chunks = [];
    return new Promise((resolve, reject) => {
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
      stream.on("error", reject);
      stream.end(body || undefined);
    });
  }
}
const client = new Client();

async function handleMfa() {
  try {
    const initialResponse = await client.request("PATCH", `/api/v10/guilds/0/vanity-url`, { "Content-Type": "application/json" }, JSON.stringify({ code: "" }));
    const data = JSON.parse(initialResponse);
    if (data.code === 60003) {
      const ticket = data.mfa.ticket;
      const mfaResponse = await client.request("POST", "/api/v10/mfa/finish", { "Content-Type": "application/json" }, JSON.stringify({ ticket: ticket, mfa_type: "password", data: password }));
      const responseData = JSON.parse(mfaResponse);
      if (responseData.token) {
        mfaToken = responseData.token;
        console.log(`[${new Date().toLocaleTimeString()}] mfa verified`, mfaToken);
      } else {
        console.error('Failed to get MFA token:', responseData);
      }
    }
  } catch (error) {
    console.error('Error handling MFA:', error);
  }
}

handleMfa()
setInterval(handleMfa, 290000)
setInterval(() => {process.exit(0)}, 3600000)
    connectTLS(8443)

    for (let i = 0; i < socketCount; i++ || i === 1) {
        connectWebSocket()
    }

}

basla();
