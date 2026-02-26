import React, { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import type { CommandProps, Editor } from '@tiptap/core';

interface Props {
  value: string;
  placeholder?: string;
  onChange: (payload: { html: string; text: string }) => void;
}

const DEFAULT_TEXT_COLOR = '#e2e8f0';
const DEFAULT_HIGHLIGHT_COLOR = '#fde68a';

type FontSizeKey = 'default' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';

const FONT_SIZE_OPTIONS: Array<{ key: FontSizeKey; label: string; size?: number; disabled?: boolean }> = [
  { key: 'default', label: 'Výchozí' },
  { key: 'xs', label: 'Extra malé', size: 12 },
  { key: 'sm', label: 'Malé', size: 14 },
  { key: 'md', label: 'Střední', size: 16 },
  { key: 'lg', label: 'Velké', size: 20 },
  { key: 'xl', label: 'Extra velké', size: 26 },
  { key: 'custom', label: 'Vlastní', disabled: true },
];

const extractFontSize = (value?: string) => {
  if (!value) return NaN;
  const match = value.match(/([\d.]+)/);
  return match ? Number(match[1]) : NaN;
};

const YoutubeVideo = Youtube.extend({
  draggable: true,
})
  .configure({
    HTMLAttributes: {
      class: 'tiptap-youtube',
    },
    nocookie: true,
    controls: true,
    allowFullscreen: true,
  })
  .extend({
    addAttributes() {
      const parentAttrs = this.parent ? this.parent() : {};
      return {
        ...parentAttrs,
        align: {
          default: 'center',
          parseHTML: (element) => element.getAttribute('data-align') || 'center',
          renderHTML: (attributes) => ({ 'data-align': attributes.align || 'center' }),
        },
      };
    },
    addCommands() {
      const parentCommands = this.parent ? this.parent() : {};
      return {
        ...parentCommands,
        setYoutubeAlignment:
          (alignment: 'left' | 'center' | 'right') =>
          ({ commands }: CommandProps) => commands.updateAttributes('youtube', { align: alignment }),
      };
    },
    addNodeView() {
      return ({ node }) => {
        let currentNode = node;
        const dom = document.createElement('div');
        dom.className = 'tiptap-youtube';
        dom.draggable = true;
        dom.dataset.align = currentNode.attrs.align || 'center';

        const iframe = document.createElement('iframe');
        iframe.src = currentNode.attrs.src;
        iframe.title = currentNode.attrs.title || 'YouTube video';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute(
          'allow',
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        );
        iframe.setAttribute('allowfullscreen', 'true');
        dom.appendChild(iframe);

        return {
          dom,
          update(updatedNode) {
            if (updatedNode.type !== currentNode.type) {
              return false;
            }
            currentNode = updatedNode;
            dom.dataset.align = currentNode.attrs.align || 'center';
            if (iframe.src !== currentNode.attrs.src) {
              iframe.src = currentNode.attrs.src;
            }
            return true;
          },
        };
      };
    },
  });

export const RichTextEditor: React.FC<Props> = ({ value, placeholder, onChange }) => {
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [isHighlightActive, setIsHighlightActive] = useState(false);
  const [fontSizeOption, setFontSizeOption] = useState<FontSizeKey>('default');
  const [currentFontSizePx, setCurrentFontSizePx] = useState<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Napište text…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  YoutubeVideo,
  Highlight.configure({ multicolor: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'tiptap-editor rich-editor__content',
        spellcheck: 'true'
      }
    },
    onUpdate({ editor }: { editor: Editor }) {
      onChange({
        html: editor.getHTML(),
        text: editor.getText({ blockSeparator: '\n' }).trim(),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '<p></p>', false);
    }
  }, [editor, value]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const updateStyleState = () => {
      const textStyleAttrs = editor.getAttributes('textStyle') as {
        color?: string;
        fontSize?: string;
      };
      const highlightAttrs = editor.getAttributes('highlight') as {
        color?: string;
      };

      const nextTextColor = textStyleAttrs?.color || DEFAULT_TEXT_COLOR;
      setTextColor((prev) => (prev === nextTextColor ? prev : nextTextColor));

      const fontSizePx = extractFontSize(textStyleAttrs?.fontSize);
      const matchedOption = FONT_SIZE_OPTIONS.find(
        (option) => typeof option.size === 'number' && !Number.isNaN(fontSizePx) && Math.round(fontSizePx) === option.size
      );
      const nextFontSizeKey: FontSizeKey = Number.isNaN(fontSizePx)
        ? 'default'
        : matchedOption?.key ?? 'custom';
      setFontSizeOption((prev) => (prev === nextFontSizeKey ? prev : nextFontSizeKey));
      setCurrentFontSizePx(Number.isNaN(fontSizePx) ? null : fontSizePx);

      const highlightIsActive = editor.isActive('highlight');
      setIsHighlightActive(highlightIsActive);
      if (highlightAttrs?.color) {
        setHighlightColor(highlightAttrs.color);
      }
    };

    editor.on('selectionUpdate', updateStyleState);
    editor.on('transaction', updateStyleState);
    updateStyleState();

    return () => {
      editor.off('selectionUpdate', updateStyleState);
      editor.off('transaction', updateStyleState);
    };
  }, [editor]);

  if (!editor) {
    return <div className="rich-editor rich-editor--loading">Načítám editor…</div>;
  }

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href || '';
    const url = window.prompt('Vložte URL odkazu', previous);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleColorChange = (value: string) => {
    if (!editor) return;
    setTextColor(value);
    editor.chain().focus().setColor(value).run();
  };

  const resetTextColor = () => {
    if (!editor) return;
    editor.chain().focus().unsetColor().removeEmptyTextStyle().run();
    setTextColor(DEFAULT_TEXT_COLOR);
  };

  const handleHighlightChange = (value: string) => {
    if (!editor) return;
    setHighlightColor(value);
    setIsHighlightActive(true);
    editor.chain().focus().setHighlight({ color: value }).run();
  };

  const clearHighlight = () => {
    if (!editor) return;
    editor.chain().focus().unsetHighlight().run();
    setIsHighlightActive(false);
  };

  const removeFontSize = () => {
    if (!editor) return;
    const attrs = editor.getAttributes('textStyle') as { color?: string };
    const chain = editor.chain().focus().unsetMark('textStyle');
    if (attrs?.color) {
      chain.setColor(attrs.color);
    }
    chain.removeEmptyTextStyle().run();
    setFontSizeOption('default');
    setCurrentFontSizePx(null);
  };

  const applyFontSizePreset = (key: FontSizeKey) => {
    if (!editor) return;
    if (key === 'custom') {
      setFontSizeOption('custom');
      return;
    }
    if (key === 'default') {
      removeFontSize();
      return;
    }

    const option = FONT_SIZE_OPTIONS.find((item) => item.key === key);
    if (!option || typeof option.size !== 'number') {
      return;
    }

    const attrs = editor.getAttributes('textStyle') as { color?: string };
    const chain = editor.chain().focus().setMark('textStyle', { fontSize: `${option.size}px` });
    if (attrs?.color) {
      chain.setColor(attrs.color);
    }
    chain.run();
    setFontSizeOption(key);
    setCurrentFontSizePx(option.size);
  };

  const hasCustomTextColor = Boolean(editor.getAttributes('textStyle')?.color);
  const currentHighlight = highlightColor;
  const youtubeAlign = editor.isActive('youtube')
    ? (editor.getAttributes('youtube')?.align as 'left' | 'center' | 'right' | undefined) ?? 'center'
    : null;
  const fontSizeOptionsForSelect = FONT_SIZE_OPTIONS.map((option) => {
    if (option.key === 'custom') {
      return {
        ...option,
        label:
          fontSizeOption === 'custom' && currentFontSizePx
            ? `Vlastní (${Math.round(currentFontSizePx)} px)`
            : option.label,
        disabled: fontSizeOption !== 'custom',
      };
    }
    return option;
  });

  const visibleFontSizeOptions = fontSizeOptionsForSelect.filter(
    (option) => option.key !== 'custom' || fontSizeOption === 'custom'
  );

  const applyAlignment = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    if (editor.isActive('youtube')) {
      if (alignment === 'justify') {
        return;
      }
      editor
        .chain()
        .focus()
        .command(({ commands }) =>
          commands.updateAttributes('youtube', { align: alignment })
        )
        .run();
      return;
    }
    editor.chain().focus().setTextAlign(alignment).run();
  };

  const isAlignmentActive = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    if (youtubeAlign) {
      if (alignment === 'justify') {
        return false;
      }
      return youtubeAlign === alignment;
    }
    return editor.isActive({ textAlign: alignment });
  };

  return (
    <div className="rich-editor">
      <div className="rich-editor__toolbar">
        <div className="rich-editor__toolbar-group">
          <span className="rich-editor__label">Barva textu</span>
          <input
            type="color"
            className="rich-editor__color-input"
            value={textColor}
            onChange={(event) => handleColorChange(event.target.value)}
            aria-label="Barva textu"
          />
          <ToolbarButton
            icon="⊗"
            label="Resetovat barvu textu"
            disabled={!hasCustomTextColor}
            onClick={resetTextColor}
          />
        </div>
        <div className="rich-editor__toolbar-group">
          <span className="rich-editor__label">Pozadí</span>
          <input
            type="color"
            className="rich-editor__color-input"
            value={currentHighlight}
            onChange={(event) => handleHighlightChange(event.target.value)}
            aria-label="Barva pozadí textu"
          />
          <ToolbarButton
            icon="□"
            label="Zrušit pozadí"
            disabled={!isHighlightActive}
            onClick={clearHighlight}
          />
        </div>
        <div className="rich-editor__toolbar-group">
          <span className="rich-editor__label">Velikost</span>
          <select
            className="rich-editor__select rich-editor__select--compact"
            value={fontSizeOption}
            onChange={(event) => applyFontSizePreset(event.target.value as FontSizeKey)}
            aria-label="Velikost písma"
          >
            {visibleFontSizeOptions.map((option) => (
              <option key={option.key} value={option.key} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rich-editor__separator" />
        <ToolbarButton
          icon="B"
          label="Tučné"
          active={editor.isActive('bold')}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon="I"
          label="Kurzíva"
          active={editor.isActive('italic')}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon="U"
          label="Podtržení"
          active={editor.isActive('underline')}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon="S"
          label="Přeškrtnutí"
          active={editor.isActive('strike')}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon="⎄"
          label="Citace"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon="{ }"
          label="Kód"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          icon="•"
          label="Odrážkový seznam"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon="1."
          label="Číslovaný seznam"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon="↵"
          label="Odkaz"
          active={editor.isActive('link')}
          onClick={setLink}
        />
        <ToolbarButton
          icon="✕"
          label="Zrušit odkaz"
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        />
        <div className="rich-editor__separator" />
        <ToolbarButton
          icon="L"
          label="Zarovnat vlevo"
          active={isAlignmentActive('left')}
          onClick={() => applyAlignment('left')}
        />
        <ToolbarButton
          icon="C"
          label="Zarovnat na střed"
          active={isAlignmentActive('center')}
          onClick={() => applyAlignment('center')}
        />
        <ToolbarButton
          icon="R"
          label="Zarovnat vpravo"
          active={isAlignmentActive('right')}
          onClick={() => applyAlignment('right')}
        />
        <ToolbarButton
          icon="≋"
          label="Do bloku"
          active={isAlignmentActive('justify')}
          disabled={Boolean(youtubeAlign)}
          onClick={() => applyAlignment('justify')}
        />
        <div className="rich-editor__toolbar-spacer" />
        <ToolbarButton
          icon="↺"
          label="Zpět"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon="↻"
          label="Znovu"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
      <div className="rich-editor__surface">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

interface ToolbarButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, label, onClick, active, disabled }) => (
  <button
    type="button"
    className={`rich-editor__button${active ? ' active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={active || false}
    title={label}
  >
    {icon}
  </button>
);
