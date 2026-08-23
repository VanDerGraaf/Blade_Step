// Best-effort IP detection for the "invite by IP" flow.
// LAN: read host candidates from a throwaway RTCPeerConnection
//   (modern browsers mDNS-obfuscate these — often returns null).
// Public: plain HTTPS GET to api.ipify.org.

export function detectLanIp(timeoutMs = 1200): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const Rtc = window.RTCPeerConnection;
      if (!Rtc) return resolve(null);
      const pc = new Rtc({ iceServers: [] });
      let found: string | null = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          pc.close();
        } catch {
          /* noop */
        }
        resolve(found);
      };
      const timer = window.setTimeout(finish, timeoutMs);
      pc.onicecandidate = (e) => {
        if (done) return;
        if (!e.candidate) {
          window.clearTimeout(timer);
          finish();
          return;
        }
        const m = e.candidate.candidate?.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (m && !m[1].startsWith("0.") && !m[1].startsWith("127.")) found = m[1];
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          window.clearTimeout(timer);
          finish();
        }
      };
      pc.createDataChannel("");
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(finish);
    } catch {
      resolve(null);
    }
  });
}

export function detectPublicIp(timeoutMs = 3500): Promise<string | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch("https://api.ipify.org?format=json", { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
    .then((j: { ip?: string }) => {
      window.clearTimeout(t);
      return typeof j?.ip === "string" ? j.ip : null;
    })
    .catch(() => {
      window.clearTimeout(t);
      return null;
    });
}
