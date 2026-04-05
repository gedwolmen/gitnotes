import { NeorgContentParser } from '../src/services/NeorgContentParser';

describe('NeorgContentParser - Code Block Tests', () => {
  describe('parseContent', () => {
    test('should parse code block with language', () => {
      const input = '```js\nconsole.log("hello");\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks?.find(block => block.type === 'code');
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.code?.language).toBe('js');
      expect(codeBlock.code?.content.trim()).toBe('console.log("hello");');
    });

    test('should parse code block without language', () => {
      const input = '```\nconsole.log("hello");\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks?.find(block => block.type === 'code');
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.code?.language).toBeUndefined();
      expect(codeBlock.code?.content.trim()).toBe('console.log("hello");');
    });

    test('should parse multi-line code block', () => {
      const input = '```python\ndef hello():\n    print("world")\n    return True\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks?.find(block => block.type === 'code');
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
      expect(result.blocks).toHaveLength(3);
      
      expect(result.blocks?.[0].type).toBe('heading');
      expect(result.blocks?.[1].type).toBe('code');
      expect(result.blocks?.[2].type).toBe('paragraph');
      
      const codeBlock = result.blocks?.[1];
      expect(codeBlock.code?.language).toBe('js');
      expect(codeBlock.code?.content.trim()).toBe('console.log("hello");');
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
      
      const firstCodeBlock = result.blocks?.[0];
      expect(firstCodeBlock?.type).toBe('code');
      expect(firstCodeBlock.code?.language).toBe('js');
      
      const secondCodeBlock = result.blocks?.[1];
      expect(secondCodeBlock?.type).toBe('code');
      expect(secondCodeBlock.code?.language).toBe('python');
    });

    test('should handle empty lines within code blocks', () => {
      const input = '```js\n\nconsole.log("hello");\n\n```';
      const result = NeorgContentParser.parseContent(input);
      
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      
      const codeBlock = result.blocks?.find(block => block.type === 'code');
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.code?.content.trim()).toBe('\n\nconsole.log("hello");\n');
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
      
      const codeBlock = result.blocks?.[0];
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
});