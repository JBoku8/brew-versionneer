import { useCallback, useEffect, useRef, useState } from "react";
import {
  DETAIL_DEFAULT_WIDTH,
  DETAIL_MIN_WIDTH,
  LIST_MIN_WIDTH,
  RESIZE_HANDLE_WIDTH,
} from "../constants/layout";
import { DETAIL_PANEL_WIDTH_KEY } from "../constants/storageKeys";
import { readStorageNumber, writeStorageNumber } from "../lib/storage";

export function usePanelResize() {
  const panelsRef = useRef<HTMLDivElement>(null);
  const [detailWidth, setDetailWidth] = useState(() =>
    readStorageNumber(DETAIL_PANEL_WIDTH_KEY, DETAIL_DEFAULT_WIDTH, DETAIL_MIN_WIDTH),
  );
  const [isResizing, setIsResizing] = useState(false);
  const detailWidthRef = useRef(detailWidth);

  useEffect(() => {
    detailWidthRef.current = detailWidth;
  }, [detailWidth]);

  const clampDetailWidth = useCallback((width: number) => {
    const container = panelsRef.current;
    const maxWidth = container
      ? container.clientWidth - LIST_MIN_WIDTH - RESIZE_HANDLE_WIDTH
      : width;
    return Math.max(DETAIL_MIN_WIDTH, Math.min(width, maxWidth));
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      setDetailWidth((current) => clampDetailWidth(current));
    }
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [clampDetailWidth]);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = detailWidthRef.current;

      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function handleMouseMove(moveEvent: MouseEvent) {
        const next = clampDetailWidth(startWidth - (moveEvent.clientX - startX));
        detailWidthRef.current = next;
        setDetailWidth(next);
      }

      function handleMouseUp() {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        writeStorageNumber(DETAIL_PANEL_WIDTH_KEY, detailWidthRef.current);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [clampDetailWidth],
  );

  return { panelsRef, detailWidth, isResizing, handleResizeStart };
}
