"use client";

import { Bold, Italic, List } from "lucide-react";
import { useEffect, useRef } from "react";

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "UL", "LI", "BR", "P", "DIV"]);

function sanitize(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!ALLOWED_TAGS.has(element.tagName)) {
          const text = document.createTextNode(element.textContent ?? "");
          node.replaceChild(text, element);
          return;
        }
        [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
        walk(element);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        node.removeChild(child);
      }
    });
  };
  walk(container);
  return container.innerHTML;
}

export function RichTextField({
  value,
  onChange,
  editable,
  ariaLabel,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  editable: boolean;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
  }, [value]);

  const format = (command: "bold" | "italic" | "insertUnorderedList") => {
    ref.current?.focus();
    document.execCommand(command);
    if (ref.current) onChange(sanitize(ref.current.innerHTML));
  };

  if (!editable) {
    return <div className="rich-text-field-display" dangerouslySetInnerHTML={{ __html: value || "<p>Not supplied</p>" }} />;
  }

  return (
    <div className="rich-text-field">
      <div className="rich-text-toolbar" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        <button type="button" aria-label="Bold" onClick={() => format("bold")}><Bold size={14} /></button>
        <button type="button" aria-label="Italic" onClick={() => format("italic")}><Italic size={14} /></button>
        <button type="button" aria-label="Bullet list" onClick={() => format("insertUnorderedList")}><List size={14} /></button>
      </div>
      <div
        ref={ref}
        className="rich-text-editable"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={(event) => onChange(sanitize(event.currentTarget.innerHTML))}
        onBlur={(event) => onChange(sanitize(event.currentTarget.innerHTML))}
      />
    </div>
  );
}
