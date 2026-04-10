"use client";

import { useState } from "react";

type Folder = {
  name: string;
  count?: number;
};

type MessagePreview = {
  id: string;
  initials: string;
  subject: string;
  time: string;
  unread: boolean;
};

export interface MessagesPanelProps {
  folders?: Folder[];
  messages?: MessagePreview[];
}

const defaultFolders: Folder[] = [
  { name: "Inbox", count: 3 },
  { name: "Sent" },
  { name: "Drafts", count: 1 },
];

const defaultMessages: MessagePreview[] = [
  {
    id: "m1",
    initials: "SM",
    subject: "Martinez Case Update",
    time: "12m",
    unread: true,
  },
  {
    id: "m2",
    initials: "JD",
    subject: "Thompson Hearing Date",
    time: "2h",
    unread: true,
  },
  {
    id: "m3",
    initials: "KL",
    subject: "Chen Document Review",
    time: "1d",
    unread: false,
  },
];

export function MessagesPanel({
  folders = defaultFolders,
  messages = defaultMessages,
}: MessagesPanelProps) {
  const [activeFolder, setActiveFolder] = useState("Inbox");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Folders */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginBottom: 6,
          padding: "0 8px",
        }}
      >
        Folders
      </div>
      {folders.map((folder) => {
        const isActive = activeFolder === folder.name;
        return (
          <div
            key={folder.name}
            onClick={() => setActiveFolder(folder.name)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              color: isActive ? "#185f9b" : "#6B7280",
              fontWeight: isActive ? 500 : 400,
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              background: isActive ? "#e6f1fa" : "transparent",
              transition: "color 0.12s ease, background 0.12s ease",
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "#F3F4F6";
                e.currentTarget.style.color = "#374151";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#6B7280";
              }
            }}
          >
            <span>{folder.name}</span>
            {folder.count != null && (
              <span
                style={{
                  fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                  fontSize: 10,
                  color: "#1d72b8",
                  background: "transparent",
                  border: "1px solid #1d72b8",
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontWeight: 500,
                }}
              >
                {folder.count}
              </span>
            )}
          </div>
        );
      })}

      {/* Message Previews */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginTop: 16,
          marginBottom: 6,
          padding: "0 8px",
        }}
      >
        Recent
      </div>
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: 8,
            borderRadius: 6,
            cursor: "pointer",
            transition: "background 0.12s ease",
            marginBottom: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#F3F4F6";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: msg.unread ? "#e6f1fa" : "#E5E7EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 600,
              color: msg.unread ? "#185f9b" : "#6B7280",
            }}
          >
            {msg.initials}
          </div>

          {/* Body */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: msg.unread ? 600 : 500,
                color: msg.unread ? "#1C1C1E" : "#374151",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.3,
              }}
            >
              {msg.subject}
            </div>
          </div>

          {/* Time + unread dot */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {msg.unread && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#1d72b8",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                fontSize: 10,
                fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                color: "#999",
              }}
            >
              {msg.time}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
