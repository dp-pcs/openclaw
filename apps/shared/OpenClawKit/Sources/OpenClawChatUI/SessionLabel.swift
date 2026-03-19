import Foundation

enum SessionLabel {
    static func displayText(_ session: OpenClawChatSessionEntry, maxLen: Int = 32) -> String {
        let raw = (session.displayName ?? session.key)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Self.middleTruncate(raw, maxLen: maxLen)
    }

    static func middleTruncate(_ raw: String, maxLen: Int) -> String {
        guard maxLen >= 8 else { return raw }
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard s.count > maxLen else { return s }

        // Keep a bit more prefix than suffix so surfaces like "imessage:" remain visible.
        let prefixLen = max(4, (maxLen * 2) / 3)
        let suffixLen = max(3, maxLen - prefixLen - 3) // 3 for "..."

        let prefix = String(s.prefix(prefixLen))
        let suffix = String(s.suffix(suffixLen))
        return "\(prefix)...\(suffix)"
    }
}

