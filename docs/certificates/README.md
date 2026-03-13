# Certificates

## Why Certificates?

iOS and modern browsers require HTTPS/WSS for WebSocket connections to non-localhost hosts. The companion server uses self-signed TLS certificates to enable secure connections from mobile devices on your local network.

## Automatic Generation (Recommended)

The setup script handles everything:

```bash
cd companion
bash setup.sh
```

This generates:
- A local CA certificate (10-year validity, 4096-bit RSA)
- A server certificate signed by the CA (2-year validity, 2048-bit RSA)
- SAN entries for localhost, *.local, 127.0.0.1, and Tailscale IP (if detected)

### With Tailscale

```bash
bash setup.sh --tailscale-ip 100.64.1.2
```

If Tailscale is installed, the script auto-detects your IP. You can also provide it explicitly.

## Manual Generation

If you need to generate certificates manually (e.g., custom SANs or validity periods):

### Step 1: Create CA

```bash
mkdir -p companion/certs && cd companion/certs

# Generate CA private key (4096-bit)
openssl genrsa -out jarvis-ca-key.pem 4096

# Generate CA certificate (10-year validity)
openssl req -x509 -new -nodes \
  -key jarvis-ca-key.pem \
  -sha256 -days 3650 \
  -out jarvis-ca.pem \
  -subj "/CN=JARVIS Local CA"
```

### Step 2: Create Server Certificate

```bash
# Generate server private key (2048-bit)
openssl genrsa -out server-key.pem 2048

# Generate certificate signing request
openssl req -new \
  -key server-key.pem \
  -out server.csr \
  -subj "/CN=jarvis-server"

# Sign with CA (2-year validity)
# Customize the SAN line with your hostname and IPs
openssl x509 -req \
  -in server.csr \
  -CA jarvis-ca.pem \
  -CAkey jarvis-ca-key.pem \
  -CAcreateserial \
  -out server.pem \
  -days 730 -sha256 \
  -extfile <(printf "subjectAltName=DNS:localhost,DNS:*.local,IP:127.0.0.1,IP:100.64.1.2")

# Clean up
rm -f server.csr jarvis-ca.srl
```

### Step 3: Verify

```bash
# View certificate details
openssl x509 -in server.pem -text -noout

# Verify chain
openssl verify -CAfile jarvis-ca.pem server.pem
```

Expected output includes:
```
Subject: CN = jarvis-server
Issuer: CN = JARVIS Local CA
X509v3 Subject Alternative Name:
    DNS:localhost, DNS:*.local, IP Address:127.0.0.1
```

## Installing on iOS

iOS devices must trust the CA certificate to connect to the WSS server.

### Step 1: Transfer the CA Certificate

Send `companion/certs/jarvis-ca.pem` to your iOS device via:
- **AirDrop** (recommended — fastest)
- Email attachment
- iCloud Drive
- Direct download from a local web server

> Only send `jarvis-ca.pem` (the CA certificate), never the private key files.

### Step 2: Install the Profile

1. Open the file on your iOS device
2. Go to **Settings > General > VPN & Device Management**
3. Tap the "JARVIS Local CA" profile
4. Tap **Install** and enter your passcode

### Step 3: Enable Certificate Trust

1. Go to **Settings > General > About > Certificate Trust Settings**
2. Find "JARVIS Local CA" in the list
3. Toggle the switch to **enable full trust**

### Verification

After installation, the iOS app should connect to `wss://your-mac.local:7777` without certificate errors.

## Installing on macOS

For the macOS Tauri app or Safari testing:

```bash
# Add CA to system keychain
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  companion/certs/jarvis-ca.pem
```

Or via Keychain Access:
1. Open **Keychain Access**
2. Drag `jarvis-ca.pem` into the **System** keychain
3. Double-click the certificate
4. Expand **Trust**
5. Set "When using this certificate" to **Always Trust**

## Certificate Renewal

Certificates should be renewed before expiry:
- CA certificate: 10-year validity (rarely needs renewal)
- Server certificate: 2-year validity

To renew:

```bash
# Delete existing certificates
rm -rf companion/certs

# Re-run setup
cd companion && bash setup.sh

# Re-install CA on iOS devices (only needed if CA was regenerated)
```

If you only need to renew the server certificate (CA unchanged), keep `jarvis-ca.pem` and `jarvis-ca-key.pem`, and regenerate only the server files. Devices won't need re-enrollment.

## Troubleshooting

**"Certificate is not trusted" on iOS:**
Ensure you completed both Step 2 (install profile) AND Step 3 (enable trust). They are separate steps.

**Connection refused after certificate renewal:**
Restart the companion server after regenerating certificates.

**"hostname mismatch" errors:**
The server certificate's SAN must include the hostname you're connecting to. Check with:
```bash
openssl x509 -in companion/certs/server.pem -text -noout | grep -A1 "Subject Alternative Name"
```

**Tailscale IP changed:**
Re-run `bash setup.sh` to regenerate certificates with the new IP.
