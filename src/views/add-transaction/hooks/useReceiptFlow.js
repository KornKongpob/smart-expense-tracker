import { useState } from "react";

export function useReceiptFlow() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [queue, setQueue] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [dupDecisionOpen, setDupDecisionOpen] = useState(false);

  return {
    isScanning,
    setIsScanning,
    scanStatus,
    setScanStatus,
    queue,
    setQueue,
    expandedId,
    setExpandedId,
    dropActive,
    setDropActive,
    dupDecisionOpen,
    setDupDecisionOpen,
  };
}
