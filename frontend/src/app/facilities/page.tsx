"use client";
import { useApp } from "../../lib/context";
import { FlowSightCanvas } from "../../components/FlowSightCanvas";

export default function FacilitiesPage() {
  const { openChatContext } = useApp();
  return (
    <div className="h-full">
      <FlowSightCanvas openChatContext={openChatContext}/>
    </div>
  );
}
