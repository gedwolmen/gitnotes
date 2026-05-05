import { NeorgContentParser } from '../src/services/NeorgContentParser';

describe('NeorgContentParser - Code Block Tests', () => {
  describe('parseContent', () => {
    test('should parse code block with language', () => {
      const input = '```js\nconsole.log("hello");\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks!.find(block => block.type === 'code')!;
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.code?.language).toBe('js');
      expect(codeBlock.code?.content.trim()).toBe('console.log("hello");');
    });

    test('should parse code block without language', () => {
      const input = '```\nconsole.log("hello");\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks!.find(block => block.type === 'code')!;
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.code?.language).toBeUndefined();
      expect(codeBlock.code?.content.trim()).toBe('console.log("hello");');
    });

    test('should parse multi-line code block', () => {
      const input = '```python\ndef hello():\n    print("world")\n    return True\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks!.find(block => block.type === 'code')!;
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.code?.language).toBe('python');
      expect(codeBlock.code?.content.trim()).toBe('def hello():\n    print("world")\n    return True');
    });

    test('should handle code block with surrounding content', () => {
      const input = `# Heading

Some paragraph

\`\`\`js
console.log("hello");
\`\`\`

Another paragraph`;
      
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
      
      expect(result.blocks?.[0].type).toBe('heading');
      expect(result.blocks?.[1].type).toBe('paragraph');
      expect(result.blocks?.[2].type).toBe('code');
      expect(result.blocks?.[3].type).toBe('paragraph');
      
      const codeBlock = result.blocks![2]!;
      expect(codeBlock?.code?.language).toBe('js');
      expect(codeBlock?.code?.content.trim()).toBe('console.log("hello");');
    });

    test('should handle multiple code blocks', () => {
      const input = `\`\`\`js
console.log("hello");
\`\`\`

\`\`\`python
def world():
    return "python"
\`\`\``;
      
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(2);
      
      const firstCodeBlock = result.blocks![0];
      expect(firstCodeBlock?.type).toBe('code');
      expect(firstCodeBlock.code?.language).toBe('js');
      
      const secondCodeBlock = result.blocks![1];
      expect(secondCodeBlock?.type).toBe('code');
      expect(secondCodeBlock.code?.language).toBe('python');
    });

    test('should handle empty lines within code blocks', () => {
      const input = '```js\n\nconsole.log("hello");\n\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks!.find(block => block.type === 'code');
      expect(codeBlock).toBeTruthy();
      expect(codeBlock!.code?.content).toBe('\nconsole.log("hello");\n');
    });

    test('should not parse incomplete code blocks as code', () => {
      const input = '```js\nconsole.log("hello");';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks?.[0].type).toBe('paragraph');
      expect(result.blocks?.[0].text).toBe('```js\nconsole.log("hello");');
    });

    test('should handle code block with complex content', () => {
      const input = `\`\`\`javascript
// Complex code example
class MyClass {
    constructor(name) {
        this.name = name;
    }
    
    greet() {
        return \`Hello, \${this.name}!\`;
    }
}

const instance = new MyClass("World");
console.log(instance.greet());
\`\`\``;
      
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks![0];
      expect(codeBlock?.type).toBe('code');
      expect(codeBlock.code?.language).toBe('javascript');
      expect(codeBlock.code?.content).toContain('class MyClass');
      expect(codeBlock.code?.content).toContain('console.log(instance.greet());');
    });
  });

  describe('contentToMarkdown', () => {
    test('should convert code block to markdown with language', () => {
      const blocks = [{
        type: 'code' as const,
        code: {
          language: 'js',
          content: 'console.log("hello");'
        }
      }];
      
      const markdown = NeorgContentParser.contentToMarkdown(blocks);
      expect(markdown).toBe('```js\nconsole.log("hello");\n```');
    });

    test('should convert code block to markdown without language', () => {
      const blocks = [{
        type: 'code' as const,
        code: {
          language: undefined,
          content: 'console.log("hello");'
        }
      }];
      
      const markdown = NeorgContentParser.contentToMarkdown(blocks);
      expect(markdown).toBe('```\nconsole.log("hello");\n```');
    });

    test('should convert mixed content including code blocks', () => {
      const blocks = [
        {
          type: 'heading' as const,
          heading: { level: 1, text: 'Title' }
        },
        {
          type: 'code' as const,
          code: {
            language: 'python',
            content: 'print("hello")'
          }
        },
        {
          type: 'paragraph' as const,
          text: 'Some text'
        }
      ];
      
      const markdown = NeorgContentParser.contentToMarkdown(blocks);
      expect(markdown).toBe('# Title\n\n```python\nprint("hello")\n```\n\nSome text');
    });
  });

  describe('Checklist Tests', () => {
    test('should parse checklist with unchecked items', () => {
      const input = '- [ ] First item\n- [ ] Second item';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const checklistBlock = result.blocks!.find(block => block.type === 'checklist')!;
      expect(checklistBlock).toBeTruthy();
      expect(checklistBlock.checklistItems).toHaveLength(2);
      
      expect(checklistBlock.checklistItems?.[0].text).toBe('First item');
      expect(checklistBlock.checklistItems?.[0].checked).toBe(false);
      expect(checklistBlock.checklistItems?.[0].indentLevel).toBe(0);
      
      expect(checklistBlock.checklistItems?.[1].text).toBe('Second item');
      expect(checklistBlock.checklistItems?.[1].checked).toBe(false);
      expect(checklistBlock.checklistItems?.[1].indentLevel).toBe(0);
    });

    test('should parse checklist with checked items', () => {
      const input = '- [x] Completed item\n- [ ] Pending item';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const checklistBlock = result.blocks![0];
      expect(checklistBlock?.type).toBe('checklist');
      expect(checklistBlock.checklistItems).toHaveLength(2);
      
      expect(checklistBlock.checklistItems?.[0].text).toBe('Completed item');
      expect(checklistBlock.checklistItems?.[0].checked).toBe(true);
      
      expect(checklistBlock.checklistItems?.[1].text).toBe('Pending item');
      expect(checklistBlock.checklistItems?.[1].checked).toBe(false);
    });

    test('should parse nested checklist items', () => {
      const input = '- [ ] Main item\n  - [ ] Sub item 1\n  - [x] Sub item 2';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const checklistBlock = result.blocks![0];
      expect(checklistBlock?.type).toBe('checklist');
      expect(checklistBlock.checklistItems).toHaveLength(3);
      
      expect(checklistBlock.checklistItems?.[0].text).toBe('Main item');
      expect(checklistBlock.checklistItems?.[0].checked).toBe(false);
      expect(checklistBlock.checklistItems?.[0].indentLevel).toBe(0);
      
      expect(checklistBlock.checklistItems?.[1].text).toBe('Sub item 1');
      expect(checklistBlock.checklistItems?.[1].checked).toBe(false);
      expect(checklistBlock.checklistItems?.[1].indentLevel).toBe(1);
      
      expect(checklistBlock.checklistItems?.[2].text).toBe('Sub item 2');
      expect(checklistBlock.checklistItems?.[2].checked).toBe(true);
      expect(checklistBlock.checklistItems?.[2].indentLevel).toBe(1);
    });

    test('should handle checklist mixed with other content', () => {
      const input = `# Todo List

- [ ] Complete project
- [ ] Write documentation

Some notes here

- [x] Already done`;
      
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
      
      expect(result.blocks?.[0].type).toBe('heading');
      expect(result.blocks?.[1].type).toBe('checklist');
      expect(result.blocks?.[2].type).toBe('paragraph');
      expect(result.blocks?.[3].type).toBe('checklist');
      
      const firstChecklist = result.blocks?.[1];
      expect(firstChecklist!.checklistItems).toHaveLength(2);
      expect(firstChecklist!.checklistItems![0].text).toBe('Complete project');
      expect(firstChecklist!.checklistItems![1].text).toBe('Write documentation');
      
      const secondChecklist = result.blocks?.[3];
      expect(secondChecklist!.checklistItems).toHaveLength(1);
      expect(secondChecklist!.checklistItems![0].text).toBe('Already done');
      expect(secondChecklist!.checklistItems![0].checked).toBe(true);
    });

    test('should convert checklist to markdown', () => {
      const checklistItems = [
        { text: 'Task 1', checked: false, indentLevel: 0 },
        { text: 'Task 2', checked: true, indentLevel: 0 },
        { text: 'Subtask', checked: false, indentLevel: 1 }
      ];
      
      const markdown = NeorgContentParser.checklistToMarkdown(checklistItems);
      expect(markdown).toBe('- [ ] Task 1\n- [x] Task 2\n  - [ ] Subtask');
    });

    test('should handle empty checklist content', () => {
      const input = '- [ ] \n- [x] ';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const checklistBlock = result.blocks![0];
      expect(checklistBlock?.type).toBe('checklist');
      expect(checklistBlock.checklistItems).toHaveLength(2);
      
      expect(checklistBlock.checklistItems?.[0].text).toBe('');
      expect(checklistBlock.checklistItems?.[0].checked).toBe(false);
      
      expect(checklistBlock.checklistItems?.[1].text).toBe('');
      expect(checklistBlock.checklistItems?.[1].checked).toBe(true);
    });

    test('should handle mixed content with checklists and other block types', () => {
      const input = `# Heading

- [ ] First checklist item
Some paragraph

\`\`\`python
print("code")
\`\`\`

- [x] Second checklist item`;
      
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(5);
      
      expect(result.blocks?.[0].type).toBe('heading');
      expect(result.blocks?.[1].type).toBe('checklist');
      expect(result.blocks?.[2].type).toBe('paragraph');
      expect(result.blocks?.[3].type).toBe('code');
      expect(result.blocks?.[4].type).toBe('checklist');
      
      const firstChecklist = result.blocks?.[1] as any;
      expect(firstChecklist.checklistItems[0].text).toBe('First checklist item');
      expect(firstChecklist.checklistItems[0].checked).toBe(false);
      
      const secondChecklist = result.blocks?.[4] as any;
      expect(secondChecklist.checklistItems[0].text).toBe('Second checklist item');
      expect(secondChecklist.checklistItems[0].checked).toBe(true);
    });
  });

  describe('NeorgContentParser - Extended Norg Features', () => {
    describe('Footnotes', () => {
      test('parses ^ Label with content', () => {
        const result = NeorgContentParser.parseContent('^ 1\n  This is a footnote');
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0]).toMatchObject({
          type: 'footnote',
          footnote: { label: '1' },
        });
        expect(result.blocks![0].footnote!.content).toContain('This is a footnote');
      });

      test('parses footnote with multi-line content', () => {
        const input = '^ mynote\n  First line\n  Second line\n\nParagraph after';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(2);
        expect(result.blocks![0]).toMatchObject({
          type: 'footnote',
          footnote: { label: 'mynote' },
        });
        expect(result.blocks![1].type).toBe('paragraph');
      });

      test('parses multiple footnotes', () => {
        const input = '^ note1\n  First footnote\n\n^ note2\n  Second footnote';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(2);
        expect(result.blocks![0].footnote!.label).toBe('note1');
        expect(result.blocks![1].footnote!.label).toBe('note2');
      });
    });

    describe('Definition Lists', () => {
      test('parses $ Term with definition text', () => {
        const result = NeorgContentParser.parseContent('$ API\n  Application Programming Interface');
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0]).toMatchObject({ type: 'definition' });
        expect(result.blocks![0].definitionItems![0].term).toBe('API');
      });

      test('parses $ Term with multi-line definition', () => {
        const input = '$ HTML\n  HyperText\n  Markup Language';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks![0].definitionItems![0].term).toBe('HTML');
        expect(result.blocks![0].definitionItems![0].definition).toContain('HyperText');
        expect(result.blocks![0].definitionItems![0].definition).toContain('Markup Language');
      });

      test('parses multiple definitions', () => {
        const input = '$ Term1\n  Def1\n\n$ Term2\n  Def2';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(2);
        expect(result.blocks![0].definitionItems![0].term).toBe('Term1');
        expect(result.blocks![1].definitionItems![0].term).toBe('Term2');
      });
    });

    describe('Indentation', () => {
      test('treats --- as indentation reversion (not divider)', () => {
        const input = '* Heading\n---\nParagraph after';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        const dividerBlocks = result.blocks!.filter(b => b.type === 'divider');
        expect(dividerBlocks).toHaveLength(0);
      });

      test('treats ___ as horizontal divider', () => {
        const result = NeorgContentParser.parseContent('___');
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0].type).toBe('divider');
      });

      test('treats *** as divider', () => {
        const result = NeorgContentParser.parseContent('***');
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0].type).toBe('divider');
      });
    });

    describe('Ranged Tags', () => {
      test('parses |example ... |end as code-like block', () => {
        const input = '|example\nsome code here\n|end';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0]).toMatchObject({
          type: 'code',
          code: { content: 'some code here' },
        });
      });

      test('skips |comment ... |end silently', () => {
        const input = '|comment\nthis is hidden\n|end\nVisible text';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0].type).toBe('paragraph');
      });
    });

    describe('Org-specific syntax not parsed', () => {
      test('does not parse #+BEGIN_SRC as block (org syntax)', () => {
        const input = '#+BEGIN_SRC js\nconsole.log("hi");\n#+END_SRC';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        const codeBlocks = result.blocks!.filter(b => b.type === 'code');
        expect(codeBlocks).toHaveLength(0);
      });

      test('does not parse :PROPERTIES: as drawer', () => {
        const input = ':PROPERTIES:\n:CREATED: today\n:END:';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        const drawerBlocks = result.blocks!.filter(b => b.type === 'drawer');
        expect(drawerBlocks).toHaveLength(0);
      });

      test('does not skip SCHEDULED: lines', () => {
        const input = 'SCHEDULED: <2025-01-01>';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks!.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Mixed content', () => {
      test('parses full norg document with all elements', () => {
        const input = `* Heading 1

Paragraph text.

- List item one
- List item two

- [ ] Checklist item

\`\`\`python
print("hello")
\`\`\`

.quote
Quote text
.end

___

^ myfn
A footnote`;

        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        const types = result.blocks!.map(b => b.type);
        expect(types).toContain('heading');
        expect(types).toContain('paragraph');
        expect(types).toContain('list');
        expect(types).toContain('checklist');
        expect(types).toContain('code');
        expect(types).toContain('quote');
        expect(types).toContain('divider');
        expect(types).toContain('footnote');
      });

      test('handles empty content', () => {
        const result = NeorgContentParser.parseContent('');
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(0);
      });

      test('handles content with only whitespace', () => {
        const result = NeorgContentParser.parseContent('   \n   \n   ');
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(0);
      });

      test('parses norg tasks with all status types', () => {
        const input = `(-) todo task
(x) done task
(!) important task
(?) uncertain task
(~) in-progress task
(u) urgent task
(-) cancelled task
(_) on-hold task
(+) recurring task`;
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0].listItems).toHaveLength(9);
        expect(result.blocks![0].listItems!.every(i => i.type === 'task')).toBe(true);
      });

      test('parses nested lists', () => {
        const input = '- top\n  - nested\n    - deep';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks![0].listItems).toHaveLength(3);
        expect(result.blocks![0].listItems![0]!.indentLevel).toBe(0);
        expect(result.blocks![0].listItems![1]!.indentLevel).toBe(1);
        expect(result.blocks![0].listItems![2]!.indentLevel).toBe(2);
      });

      test('parses code blocks with norg syntax =code.lang ... =', () => {
        const input = '=code.python\nprint("hi")\n=';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0]).toMatchObject({
          type: 'code',
          code: { language: 'python', content: 'print("hi")' },
        });
      });

      test('parses .quote ranged tag', () => {
        const input = '.quote\nSome quoted text\n.end';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0]).toMatchObject({
          type: 'quote',
          text: 'Some quoted text',
        });
      });

      test('parses inline markup in headings', () => {
        const input = '* This is *bold* text';
        const result = NeorgContentParser.parseContent(input);
        expect(result.success).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks![0].heading!.text).toBe('This is *bold* text');
      });
    });
  });
});