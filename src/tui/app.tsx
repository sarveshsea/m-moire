/**
 * Noche TUI — Terminal User Interface for monitoring and control.
 * Built with Ink (React for terminals).
 */

import React, { useState, useEffect } from "react";
import { render, Box, Text } from "ink";
import type { ArkEngine, ArkEvent } from "../engine/core.js";

interface TuiProps {
  engine: ArkEngine;
}

function StatusBar({ engine }: TuiProps) {
  const project = engine.project;
  const figmaConnected = engine.figma.isConnected;

  return (
    <Box borderStyle="single" paddingX={1} flexDirection="row" justifyContent="space-between">
      <Text bold>
        {" "}ark{" "}
      </Text>
      <Text>
        {project?.framework ?? "unknown"}{" "}
        {project?.styling.tailwind ? "· tailwind" : ""}{" "}
        {project?.shadcn.installed ? "· shadcn" : ""}
      </Text>
      <Text color={figmaConnected ? "green" : "gray"}>
        {figmaConnected ? "● Figma" : "○ Figma"}
      </Text>
    </Box>
  );
}

function ActivityFeed({ events }: { events: ArkEvent[] }) {
  const recent = events.slice(-10);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold underline>Activity</Text>
      {recent.length === 0 && (
        <Text color="gray">No activity yet</Text>
      )}
      {recent.map((evt, i) => {
        const color = {
          info: "blue" as const,
          warn: "yellow" as const,
          error: "red" as const,
          success: "green" as const,
        }[evt.type];

        return (
          <Text key={i} color={color}>
            {evt.timestamp.toLocaleTimeString()} [{evt.source}] {evt.message}
          </Text>
        );
      })}
    </Box>
  );
}

function SpecsSummary({ engine }: TuiProps) {
  const [specs, setSpecs] = useState<{ type: string; name: string; generated: boolean }[]>([]);

  useEffect(() => {
    engine.registry.getAllSpecs().then((all) => {
      setSpecs(
        all.map((s) => ({
          type: s.type,
          name: s.name,
          generated: !!engine.registry.getGenerationState(s.name),
        }))
      );
    });
  }, []);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold underline>Specs</Text>
      {specs.length === 0 && (
        <Text color="gray">No specs — run `ark spec component Name`</Text>
      )}
      {specs.map((s, i) => (
        <Text key={i}>
          <Text color={s.generated ? "green" : "gray"}>
            {s.generated ? "✔" : "○"}
          </Text>
          {" "}
          <Text color="cyan">{s.type.padEnd(10)}</Text>
          {s.name}
        </Text>
      ))}
    </Box>
  );
}

function ResearchSummary({ engine }: TuiProps) {
  const store = engine.research.getStore();

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold underline>Research</Text>
      <Text>Insights: {store.insights.length}</Text>
      <Text>Themes:   {store.themes.length}</Text>
      <Text>Sources:  {store.sources.length}</Text>
      {store.insights.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Latest:</Text>
          {store.insights.slice(-3).map((insight, i) => (
            <Text key={i} color="gray">
              · {insight.finding.slice(0, 60)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ArkTui({ engine }: TuiProps) {
  const [events, setEvents] = useState<ArkEvent[]>([]);

  useEffect(() => {
    const handler = (evt: ArkEvent) => {
      setEvents((prev) => [...prev.slice(-50), evt]);
    };
    engine.on("event", handler);
    return () => { engine.off("event", handler); };
  }, [engine]);

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar engine={engine} />
      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" width="60%">
          <ActivityFeed events={events} />
        </Box>
        <Box flexDirection="column" width="40%">
          <SpecsSummary engine={engine} />
          <Box marginTop={1}>
            <ResearchSummary engine={engine} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function startTui(engine: ArkEngine) {
  render(<ArkTui engine={engine} />);
}
