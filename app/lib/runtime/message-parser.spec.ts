import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EnhancedStreamingMessageParser } from './enhanced-message-parser';
import {
  StreamingMessageParser,
  cleanFileActionContent,
  type ActionCallback,
  type ArtifactCallback,
} from './message-parser';
import { parseSearchReplaceBlocks } from '~/utils/search-replace';

interface ExpectedResult {
  output: string;
  callbacks?: {
    onArtifactOpen?: number;
    onArtifactClose?: number;
    onActionOpen?: number;
    onActionClose?: number;
  };
}

describe('StreamingMessageParser', () => {
  it('should pass through normal text', () => {
    const parser = new StreamingMessageParser();
    expect(parser.parse('test_id', 'Hello, world!')).toBe('Hello, world!');
  });

  it('should allow normal HTML tags', () => {
    const parser = new StreamingMessageParser();
    expect(parser.parse('test_id', 'Hello <strong>world</strong>!')).toBe('Hello <strong>world</strong>!');
  });

  describe('no artifacts', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      ['Foo bar', 'Foo bar'],
      ['Foo bar <', 'Foo bar '],
      ['Foo bar <p', 'Foo bar <p'],
      [['Foo bar <', 's', 'p', 'an>some text</span>'], 'Foo bar <span>some text</span>'],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });

    it('should clean syntax-highlighted HTML snippets before writing TSX files', () => {
      const callbacks = {
        onArtifactOpen: vi.fn(),
        onArtifactClose: vi.fn(),
        onActionOpen: vi.fn(),
        onActionClose: vi.fn(),
      };

      const parser = new StreamingMessageParser({ callbacks });

      const input = `<boltArtifact title="Workspace.tsx" id="artifact_1" type="bundled"><boltAction type="file" filePath="src/components/Editor/Workspace.tsx">
<span className="text-purple-400">export default function</span> <span className="text-yellow-400">App</span>() &#123;<br/>
&nbsp;&nbsp;<span className="text-purple-400">return</span> (<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<<span className="text-blue-400">div</span> <span className="text-orange-400">className</span>=<span className="text-green-400">"min-h-screen bg-background"</span>><br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<<span className="text-blue-400">Layout</span>><br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<<span className="text-blue-400">h1</span>>Welcome to Bolt</<span className="text-blue-400">h1</span>><br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</<span className="text-blue-400">Layout</span>><br/>
&nbsp;&nbsp;&nbsp;&nbsp;</<span className="text-blue-400">div</span>><br/>
&nbsp;&nbsp;);<br/>
&#125;
</boltAction></boltArtifact>`;

      parser.parse('highlighted_tsx', input);

      expect(callbacks.onActionClose).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'file',
            filePath: 'src/components/Editor/Workspace.tsx',
            content: expect.stringContaining('<div className="min-h-screen bg-background">'),
          }),
        }),
      );

      const content = callbacks.onActionClose.mock.calls[0][0].action.content;

      expect(content).toContain('</Layout>');
      expect(content).not.toContain('<span');
      expect(content).not.toContain('&nbsp;');
      expect(content).not.toContain('<br/>');
    });
  });

  describe('invalid or incomplete artifacts', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      ['Foo bar <b', 'Foo bar '],
      ['Foo bar <ba', 'Foo bar <ba'],
      ['Foo bar <bol', 'Foo bar '],
      ['Foo bar <bolt', 'Foo bar '],
      ['Foo bar <bolta', 'Foo bar <bolta'],
      ['Foo bar <boltA', 'Foo bar '],
      ['Foo bar <boltArtifacs></boltArtifact>', 'Foo bar <boltArtifacs></boltArtifact>'],
      ['Before <oltArtfiact>foo</boltArtifact> After', 'Before <oltArtfiact>foo</boltArtifact> After'],
      ['Before <boltArtifactt>foo</boltArtifact> After', 'Before <boltArtifactt>foo</boltArtifact> After'],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });

  describe('valid artifacts without actions', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      [
        'Some text before <boltArtifact title="Some title" id="artifact_1">foo bar</boltArtifact> Some more text',
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact',
          ' title="Some title" id="artifact_1" type="bundled" >foo</boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fac',
          't title="Some title" id="artifact_1"',
          ' ',
          '>',
          'foo</boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact',
          ' title="Some title" id="artifact_1"',
          ' >fo',
          'o</boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact tit',
          'le="Some ',
          'title" id="artifact_1">fo',
          'o',
          '<',
          '/boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact title="Some title" id="artif',
          'act_1">fo',
          'o<',
          '/boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        'Before <boltArtifact title="Some title" id="artifact_1">foo</boltArtifact> After',
        {
          output: 'Before  After',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });

  describe('valid artifacts with actions', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      [
        'Before <boltArtifact title="Some title" id="artifact_1"><boltAction type="shell">npm install</boltAction></boltArtifact> After',
        {
          output: 'Before  After',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 1, onActionClose: 1 },
        },
      ],
      [
        'Before <boltArtifact title="Some title" id="artifact_1"><boltAction type="shell">npm install</boltAction><boltAction type="file" filePath="index.js">some content</boltAction></boltArtifact> After',
        {
          output: 'Before  After',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 2, onActionClose: 2 },
        },
      ],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });
});

describe('EnhancedStreamingMessageParser', () => {
  describe('reset/delta duplication regression (#37)', () => {
    const mkParser = () =>
      new EnhancedStreamingMessageParser({
        callbacks: {
          onArtifactOpen: vi.fn(),
          onArtifactClose: vi.fn(),
          onActionOpen: vi.fn(),
          onActionClose: vi.fn(),
        },
      });

    /*
     * Cumulative streaming chunks of a message that wraps a code block into an
     * artifact part-way through (the model never emits explicit artifact tags).
     */
    const fullMessage =
      "Create index.js:\n\n```javascript\nfunction hello() {\n  console.log('UNIQUE_TOKEN_X');\n}\n```\n";

    const streamChunks = () => {
      const chunks: string[] = [];

      for (let i = 4; i < fullMessage.length; i += 5) {
        chunks.push(fullMessage.slice(0, i));
      }

      chunks.push(fullMessage);

      return chunks;
    };

    it('signals a reset (full-reparse, not delta) when wrapping a detected code block', () => {
      const parser = mkParser();

      let sawReset = false;

      for (const cumulative of streamChunks()) {
        parser.parse('stream_id', cumulative);

        if (parser.consumeDidReset('stream_id')) {
          sawReset = true;
        }
      }

      expect(sawReset).toBe(true);
    });

    it('does NOT duplicate content when the caller replaces on reset (vs naive append)', () => {
      // Buggy strategy: always append the returned string (the pre-fix caller).
      const buggyParser = mkParser();

      let buggy = '';

      for (const cumulative of streamChunks()) {
        buggy += buggyParser.parse('buggy', cumulative);
        buggyParser.consumeDidReset('buggy');
      }

      // Fixed strategy: replace on reset, append otherwise (the post-fix caller).
      const fixedParser = mkParser();

      let fixed = '';

      for (const cumulative of streamChunks()) {
        const out = fixedParser.parse('fixed', cumulative);
        fixed = fixedParser.consumeDidReset('fixed') ? out : fixed + out;
      }

      const count = (haystack: string) => haystack.split('UNIQUE_TOKEN_X').length - 1;

      /*
       * The naive-append path duplicates the payload (raw streamed text + the
       * re-parsed result); the replace-on-reset path keeps it to at most one.
       */
      expect(count(buggy)).toBeGreaterThan(count(fixed));
      expect(count(fixed)).toBeLessThanOrEqual(1);
    });

    it('consumeDidReset returns false for a plain-text message (no wrapping)', () => {
      const parser = mkParser();
      parser.parse('plain', 'just some prose with no code block');
      expect(parser.consumeDidReset('plain')).toBe(false);
    });
  });

  it('should detect shell commands in code blocks', () => {
    const callbacks = {
      onArtifactOpen: vi.fn(),
      onArtifactClose: vi.fn(),
      onActionOpen: vi.fn(),
      onActionClose: vi.fn(),
    };

    const parser = new EnhancedStreamingMessageParser({
      callbacks,
    });

    const input = '```bash\nnpm install && npm run dev\n```';
    parser.parse('test_id', input);

    expect(callbacks.onActionOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          type: 'shell',
          content: 'npm install && npm run dev',
        }),
      }),
    );
  });

  it('localizes the synthetic shell artifact while preserving the command', () => {
    const callbacks = {
      onArtifactOpen: vi.fn(),
      onArtifactClose: vi.fn(),
      onActionOpen: vi.fn(),
      onActionClose: vi.fn(),
    };

    const parser = new EnhancedStreamingMessageParser({ callbacks, language: () => 'fr' });

    parser.parse('localized_shell', '```bash\nnpm install && npm run dev\n```');

    expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(expect.objectContaining({ title: 'Commande shell' }));
    expect(callbacks.onActionOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ content: 'npm install && npm run dev' }),
      }),
    );
  });

  it('should detect file creation from code blocks with context', () => {
    const callbacks = {
      onArtifactOpen: vi.fn(),
      onArtifactClose: vi.fn(),
      onActionOpen: vi.fn(),
      onActionClose: vi.fn(),
    };

    const parser = new EnhancedStreamingMessageParser({
      callbacks,
    });

    const input =
      'Create a new file called index.js:\n\n```javascript\nfunction hello() {\n  console.log("Hello World");\n}\n```';
    parser.parse('test_id', input);

    expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringContaining('test_id-'),
        title: 'index.js',
      }),
    );
  });

  it('should not create actions for code blocks without context', () => {
    const callbacks = {
      onArtifactOpen: vi.fn(),
      onArtifactClose: vi.fn(),
      onActionOpen: vi.fn(),
      onActionClose: vi.fn(),
    };

    const parser = new EnhancedStreamingMessageParser({
      callbacks,
    });

    const input = 'Here is some code:\n\n```javascript\nfunction test() {}\n```';
    parser.parse('test_id', input);

    expect(callbacks.onArtifactOpen).not.toHaveBeenCalled();
    expect(callbacks.onActionOpen).not.toHaveBeenCalled();
  });

  describe('AI Model Output Patterns Integration Tests', () => {
    let callbacks: {
      onArtifactOpen: any;
      onArtifactClose: any;
      onActionOpen: any;
      onActionClose: any;
    };

    let parser: EnhancedStreamingMessageParser;

    beforeEach(() => {
      callbacks = {
        onArtifactOpen: vi.fn(),
        onArtifactClose: vi.fn(),
        onActionOpen: vi.fn(),
        onActionClose: vi.fn(),
      };
      parser = new EnhancedStreamingMessageParser({ callbacks });
    });

    describe('GPT-4 style outputs', () => {
      it('should handle file creation with explicit path', () => {
        const input = `I'll create a React component for you.

app/components/Button.tsx:

\`\`\`tsx
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
};
\`\`\``;

        parser.parse('test_gpt4_1', input);

        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Button.tsx',
          }),
        );
        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'file',
              filePath: '/app/components/Button.tsx',
            }),
          }),
        );
      });

      it('should handle package.json updates', () => {
        const input = `Update your package.json file:

package.json:

\`\`\`json
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.0.0"
  }
}
\`\`\``;

        parser.parse('test_gpt4_2', input);

        expect(callbacks.onArtifactOpen).toHaveBeenCalled();
        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'file',
              filePath: '/package.json',
            }),
          }),
        );
      });
    });

    describe('Claude style outputs', () => {
      it('should handle create file instructions', () => {
        const input = `I'll create a new configuration file for you.

Create a file called \`config.ts\`:

\`\`\`typescript
export const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
};
\`\`\``;

        parser.parse('test_claude_1', input);

        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'config.ts',
          }),
        );
        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'file',
              filePath: '/config.ts',
            }),
          }),
        );
      });

      it('should handle "Here\'s the file" pattern', () => {
        const input = `Here's styles.css:

\`\`\`css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
}
\`\`\``;

        parser.parse('test_claude_2', input);

        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'styles.css',
          }),
        );
      });
    });

    describe('Gemini style outputs', () => {
      it('should handle file comments in code', () => {
        const input = `Here's your component:

\`\`\`javascript
// filename: utils/helper.js
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US').format(date);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export { formatDate, debounce };
\`\`\``;

        parser.parse('test_gemini_1', input);

        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'helper.js',
          }),
        );
        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'file',
              filePath: '/utils/helper.js',
            }),
          }),
        );
      });

      it('should handle "update filename.ext" pattern', () => {
        const input = `Update server.js:

\`\`\`javascript
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
\`\`\``;

        parser.parse('test_gemini_2', input);

        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'server.js',
          }),
        );
      });
    });

    describe('Shell Command Detection', () => {
      it('should detect npm commands', () => {
        const input = `Run these commands:

\`\`\`bash
npm install express cors
npm run dev
\`\`\``;

        parser.parse('test_shell_1', input);

        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'shell',
              content: 'npm install express cors\nnpm run dev',
            }),
          }),
        );
      });

      it('should detect git commands', () => {
        const input = `Initialize your repository:

\`\`\`bash
git init
git add .
git commit -m "Initial commit"
\`\`\``;

        parser.parse('test_shell_2', input);

        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'shell',
              content: 'git init\ngit add .\ngit commit -m "Initial commit"',
            }),
          }),
        );
      });

      it('should detect docker commands', () => {
        const input = `Build and run the Docker container:

\`\`\`bash
docker build -t myapp .
docker run -p 3000:3000 myapp
\`\`\``;

        parser.parse('test_shell_3', input);

        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'shell',
              content: 'docker build -t myapp .\ndocker run -p 3000:3000 myapp',
            }),
          }),
        );
      });

      it('should detect webcontainer commands', () => {
        const input = `Check your files:

\`\`\`bash
ls -la
cat package.json
mkdir src
\`\`\``;

        parser.parse('test_shell_4', input);

        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'shell',
              content: 'ls -la\ncat package.json\nmkdir src',
            }),
          }),
        );
      });
    });

    describe('Edge Cases and False Positive Prevention', () => {
      it('should not create artifacts for generic code examples', () => {
        const input = `Here's an example of how functions work:

\`\`\`javascript
function example() {
  console.log("This is just an example");
}
\`\`\``;

        parser.parse('test_edge_1', input);

        expect(callbacks.onArtifactOpen).not.toHaveBeenCalled();
        expect(callbacks.onActionOpen).not.toHaveBeenCalled();
      });

      it('should ignore temp and test file patterns', () => {
        const input = `Create temp/test.js:

\`\`\`javascript
console.log("temporary test");
\`\`\``;

        parser.parse('test_edge_2', input);

        expect(callbacks.onArtifactOpen).not.toHaveBeenCalled();
        expect(callbacks.onActionOpen).not.toHaveBeenCalled();
      });

      it('should handle multiple code blocks with mixed content', () => {
        const input = `First, create the component:

components/Header.tsx:
\`\`\`tsx
import React from 'react';
export const Header = () => <h1>Header</h1>;
\`\`\`

Then install dependencies:

\`\`\`bash
npm install react-router-dom
\`\`\`

Here's an example of usage:

\`\`\`javascript
// This is just an example
function usage() {
  return <Header />;
}
\`\`\``;

        parser.parse('test_edge_3', input);

        // Should create artifact for Header.tsx
        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Header.tsx',
          }),
        );

        // Should create shell action for npm install
        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'shell',
              content: 'npm install react-router-dom',
            }),
          }),
        );

        // Should not create action for the example usage
        const fileActions = callbacks.onActionOpen.mock.calls.filter((call: any) => call[0].action.type === 'file');

        expect(fileActions).toHaveLength(1); // Only Header.tsx
      });

      it('should validate file extensions', () => {
        const input = `Create invalidfile:

\`\`\`
console.log("no extension");
\`\`\``;

        parser.parse('test_edge_4', input);

        expect(callbacks.onArtifactOpen).not.toHaveBeenCalled();
        expect(callbacks.onActionOpen).not.toHaveBeenCalled();
      });

      it('should handle complex file paths correctly', () => {
        const input = `Create the nested component:

src/components/ui/Button/index.tsx:

\`\`\`tsx
import React from 'react';
export { Button } from './Button';
\`\`\``;

        parser.parse('test_edge_5', input);

        expect(callbacks.onActionOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              type: 'file',
              filePath: '/src/components/ui/Button/index.tsx',
            }),
          }),
        );
      });
    });

    describe('Performance and Deduplication', () => {
      it('should handle incremental parsing correctly', () => {
        // Parse incrementally (simulating streaming)
        const chunks = ['Create config.js:\n\n\`\`\`javascript\n', "const config = { api: 'test' };\n\`\`\`"];

        let fullInput = '';

        for (const chunk of chunks) {
          fullInput += chunk;
          parser.parse('test_perf_1', fullInput);
        }

        // Should create artifact when complete
        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'config.js',
          }),
        );
      });

      it('should handle streaming input correctly', () => {
        const chunks = [
          'Create the file:\n\n',
          'app.js:\n\n',
          '\`\`\`javascript\n',
          'const app = ',
          'express();\n',
          'app.listen(3000);\n',
          '\`\`\`',
        ];

        let fullInput = '';

        for (const chunk of chunks) {
          fullInput += chunk;
          parser.parse('test_stream_1', fullInput);
        }

        expect(callbacks.onArtifactOpen).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'app.js',
          }),
        );
      });
    });

    describe('Performance Benchmarks', () => {
      it('should perform well with enhanced parsing', () => {
        const testInputs = [
          `Create app.tsx:\n\n\`\`\`tsx\nimport React from 'react';\nexport const App = () => <div>Hello</div>;\n\`\`\``,
          `Run commands:\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``,
          `Here's config.json:\n\n\`\`\`json\n{"name": "test"}\n\`\`\``,
          `Example code:\n\n\`\`\`javascript\nfunction example() {}\n\`\`\``,
        ];

        // Benchmark enhanced parser
        const enhancedCallbacks = {
          onArtifactOpen: vi.fn(),
          onArtifactClose: vi.fn(),
          onActionOpen: vi.fn(),
          onActionClose: vi.fn(),
        };

        const enhancedParser = new EnhancedStreamingMessageParser({
          callbacks: enhancedCallbacks,
        });

        const startTime = performance.now();
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
          testInputs.forEach((input, index) => {
            enhancedParser.parse(`perf_test_${i}_${index}`, input);
          });
          enhancedParser.reset();
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        const avgTimePerOp = duration / (iterations * testInputs.length);

        // Should complete quickly (less than 1ms average per operation)
        expect(avgTimePerOp).toBeLessThan(1.0);

        // Should detect artifacts appropriately
        expect(enhancedCallbacks.onArtifactOpen.mock.calls.length).toBeGreaterThan(0);

        console.log(`Performance: ${avgTimePerOp.toFixed(4)}ms per operation`);
        console.log(`Artifacts detected: ${enhancedCallbacks.onArtifactOpen.mock.calls.length}`);
        console.log(`Actions detected: ${enhancedCallbacks.onActionOpen.mock.calls.length}`);
      });
    });
  });
});

describe('cleanFileActionContent (HTML-entity corruption regression)', () => {
  it('does NOT decode HTML entities in plain TSX source (no highlighter fingerprint)', () => {
    const tsx = 'export default function App() {\n  return <p>a &lt; b &amp;&amp; c &gt; d</p>;\n}';

    // The decode would have turned `&lt;` into a literal `<` -> invalid JSX.
    expect(cleanFileActionContent(tsx, 'src/App.tsx')).toBe(tsx);
  });

  it('does NOT decode HTML entities in plain JS/CSS/SCSS source', () => {
    const js = 'const cmp = (a, b) => a &lt; b &amp;&amp; b &gt; 0;';
    const css = '.a::before { content: "&amp;"; }';

    expect(cleanFileActionContent(js, 'src/util.js')).toBe(js);
    expect(cleanFileActionContent(css, 'src/styles.css')).toBe(css);
    expect(cleanFileActionContent(css, 'src/styles.scss')).toBe(css);
  });

  it('strips markdown fences but leaves entities intact for source files', () => {
    const fenced = '```tsx\nreturn <span>{count} &amp;&amp; valid</span>;\n```';

    expect(cleanFileActionContent(fenced, 'src/Counter.tsx')).toBe('return <span>{count} &amp;&amp; valid</span>;');
  });

  it('still decodes + strips real syntax-highlighter markup (fingerprint present)', () => {
    const highlighted =
      '<span class="hljs-keyword">return</span>&nbsp;<span class="hljs-number">1</span>&nbsp;&lt;&nbsp;<span class="hljs-number">2</span><br/>';

    const cleaned = cleanFileActionContent(highlighted, 'src/Highlighted.tsx');

    expect(cleaned).toContain('return');
    expect(cleaned).toContain('1 < 2');
    expect(cleaned).not.toContain('<span');
    expect(cleaned).not.toContain('&nbsp;');
    expect(cleaned).not.toContain('<br/>');
    expect(cleaned).not.toContain('&lt;');
  });

  it('preserves JSX entities end-to-end through the streaming parser onActionClose', () => {
    const callbacks = {
      onArtifactOpen: vi.fn(),
      onArtifactClose: vi.fn(),
      onActionOpen: vi.fn(),
      onActionClose: vi.fn(),
    };

    const parser = new StreamingMessageParser({ callbacks });

    const input =
      '<boltArtifact title="App.tsx" id="a1" type="bundled">' +
      '<boltAction type="file" filePath="src/App.tsx">' +
      'export default function App() {\n  return <p>a &lt; b</p>;\n}' +
      '</boltAction></boltArtifact>';

    parser.parse('entity_tsx', input);

    const content = callbacks.onActionClose.mock.calls[0][0].action.content as string;

    // `&lt;` must survive: decoding it to `<` would break the JSX.
    expect(content).toContain('a &lt; b');
    expect(content).not.toContain('a < b');
  });
});

describe('diff (anchored search/replace) actions — increment 2/5 parser wiring', () => {
  const mkCallbacks = () => ({
    onArtifactOpen: vi.fn(),
    onArtifactClose: vi.fn(),
    onActionOpen: vi.fn(),
    onActionStream: vi.fn(),
    onActionClose: vi.fn(),
  });

  /*
   * A raw search/replace block with NO surrounding whitespace, so the parser's
   * universal outer `.trim()` is a no-op and `content` is byte-exact.
   */
  const diffBlock =
    '<<<<<<< SEARCH\n' + '  const answer = 41;\n' + '=======\n' + '  const answer = 42;\n' + '>>>>>>> REPLACE';

  it('parses a diff action with type "diff", the correct filePath, and BYTE-EXACT content', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    const input =
      '<boltArtifact title="Patch" id="a1" type="bundled">' +
      '<boltAction type="diff" filePath="src/answer.ts">' +
      diffBlock +
      '</boltAction></boltArtifact>';

    parser.parse('diff_1', input);

    expect(callbacks.onActionClose).toHaveBeenCalledTimes(1);

    const action = callbacks.onActionClose.mock.calls[0][0].action;

    expect(action.type).toBe('diff');
    expect(action.filePath).toBe('src/answer.ts');

    /*
     * Byte-exact: markers preserved verbatim, no trailing '\n' appended (that is
     * a file-only massaging that must NOT run for a diff), no fence/entity edits.
     */
    expect(action.content).toBe(diffBlock);
    expect(action.content.endsWith('>>>>>>> REPLACE')).toBe(true);
    expect(action.content).toContain('<<<<<<< SEARCH');
    expect(action.content).toContain('\n=======\n');
    expect(action.content).toContain('>>>>>>> REPLACE');

    // The preserved markers round-trip through the increment-1 block parser.
    const parsed = parseSearchReplaceBlocks(action.content);
    expect(parsed.malformed).toBe(false);
    expect(parsed.blocks).toEqual([{ search: '  const answer = 41;', replace: '  const answer = 42;' }]);
  });

  it('preserves markers byte-exact even with surrounding prose/whitespace (only outer trim applied)', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    const input =
      '<boltArtifact title="Patch" id="a1" type="bundled">' +
      '<boltAction type="diff" filePath="src/x.ts">\n' +
      diffBlock +
      '\n</boltAction></boltArtifact>';

    parser.parse('diff_ws', input);

    const action = callbacks.onActionClose.mock.calls[0][0].action;

    // Outer whitespace trimmed (same as every non-file action), block verbatim.
    expect(action.content).toBe(diffBlock);
  });

  it('fires onActionStream as diff content accumulates and onActionClose with the full raw block', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    const head = '<boltArtifact title="Patch" id="a1" type="bundled"><boltAction type="diff" filePath="src/answer.ts">';
    const tail = '</boltAction></boltArtifact>';
    const full = head + diffBlock + tail;

    // Feed cumulative chunks (the parser is called with the growing message).
    const chunks: string[] = [];

    for (let i = 4; i < full.length; i += 7) {
      chunks.push(full.slice(0, i));
    }

    chunks.push(full);

    for (const cumulative of chunks) {
      parser.parse('diff_stream', cumulative);
    }

    // onActionStream fired at least once for the diff action while it streamed.
    expect(callbacks.onActionStream).toHaveBeenCalled();

    const streamedTypes = callbacks.onActionStream.mock.calls.map((c: any) => c[0].action.type);
    expect(streamedTypes.every((t: string) => t === 'diff')).toBe(true);

    /*
     * Streamed content is the RAW accumulating text (no fence/newline massaging):
     * every streamed payload is a prefix of the final raw block.
     */
    for (const call of callbacks.onActionStream.mock.calls) {
      const streamed = call[0].action.content as string;
      expect(diffBlock.startsWith(streamed) || streamed.startsWith(diffBlock)).toBe(true);
    }

    // Final close carries the full byte-exact block.
    expect(callbacks.onActionClose).toHaveBeenCalledTimes(1);
    expect(callbacks.onActionClose.mock.calls[0][0].action.content).toBe(diffBlock);
  });

  it('parses file + diff + shell in a single artifact, in order, with the correct types', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    const input =
      '<boltArtifact title="Mixed" id="a1" type="bundled">' +
      '<boltAction type="file" filePath="index.js">console.log(1);</boltAction>' +
      '<boltAction type="diff" filePath="src/answer.ts">' +
      diffBlock +
      '</boltAction>' +
      '<boltAction type="shell">npm run build</boltAction>' +
      '</boltArtifact>';

    parser.parse('mixed_1', input);

    const openedTypes = callbacks.onActionOpen.mock.calls.map((c: any) => c[0].action.type);
    expect(openedTypes).toEqual(['file', 'diff', 'shell']);

    const closedTypes = callbacks.onActionClose.mock.calls.map((c: any) => c[0].action.type);
    expect(closedTypes).toEqual(['file', 'diff', 'shell']);

    // The file action is unaffected by the diff wiring: fences/newline as before.
    const fileClose = callbacks.onActionClose.mock.calls.find((c: any) => c[0].action.type === 'file');
    expect(fileClose[0].action.content).toBe('console.log(1);\n');

    // The diff action is byte-exact (no trailing newline).
    const diffClose = callbacks.onActionClose.mock.calls.find((c: any) => c[0].action.type === 'diff');
    expect(diffClose[0].action.content).toBe(diffBlock);
  });

  it('parses a MALFORMED diff at the parser level (validation/apply is the runner job, increment 3/5)', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    // Not a valid search/replace payload (no divider / no REPLACE marker).
    const junk = '<<<<<<< SEARCH\nthis block never closes';

    const input =
      '<boltArtifact title="Bad" id="a1" type="bundled">' +
      '<boltAction type="diff" filePath="src/broken.ts">' +
      junk +
      '</boltAction></boltArtifact>';

    parser.parse('diff_bad', input);

    // Parser still emits the action verbatim — it does NOT validate or apply.
    expect(callbacks.onActionClose).toHaveBeenCalledTimes(1);

    const action = callbacks.onActionClose.mock.calls[0][0].action;
    expect(action.type).toBe('diff');
    expect(action.filePath).toBe('src/broken.ts');
    expect(action.content).toBe(junk);

    /*
     * And the increment-1 parser flags it malformed — proving the parser passed
     * the raw (invalid) markers through untouched for the runner to reject later.
     */
    expect(parseSearchReplaceBlocks(action.content).malformed).toBe(true);
  });

  it('leaves an existing file action BYTE-IDENTICAL (regression guard alongside diff wiring)', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    const input =
      '<boltArtifact title="File" id="a1" type="bundled">' +
      '<boltAction type="file" filePath="src/App.tsx">' +
      'export default function App() {\n  return <p>a &lt; b</p>;\n}' +
      '</boltAction></boltArtifact>';

    parser.parse('file_regress', input);

    const content = callbacks.onActionClose.mock.calls[0][0].action.content as string;

    // Same behavior as before the diff wiring: JSX entity preserved, trailing '\n' added.
    expect(content).toBe('export default function App() {\n  return <p>a &lt; b</p>;\n}\n');
  });
});

/*
 * Regression: a `</boltAction>` close tag split across streaming chunk boundaries
 * must NEVER leak a partial `</bo` into the streamed editor preview / autosave.
 *
 * This is the exact data-loss defect observed in prod: an in-place file edit was
 * saved with a stray `</bo` and the real file tail missing. The model's output
 * was truncated MID-CLOSE-TAG (it stopped at `</bo`), so `onActionClose` — which
 * strips the real `</boltAction>` — never fired, and the last streamed payload
 * (which included `</bo`) is what landed on disk. Every assertion below FAILS
 * against the pre-fix parser, which emitted `input.slice(i)` verbatim.
 */
describe('streaming close-tag split across chunks — no partial `</bo` leak (data-loss regression)', () => {
  const mkCallbacks = () => ({
    onArtifactOpen: vi.fn(),
    onArtifactClose: vi.fn(),
    onActionOpen: vi.fn(),
    onActionStream: vi.fn(),
    onActionClose: vi.fn(),
  });

  const lastStreamedContent = (callbacks: ReturnType<typeof mkCallbacks>): string => {
    const calls = callbacks.onActionStream.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    return calls[calls.length - 1][0].action.content as string;
  };

  // Assert `src` is syntactically valid JS (throws SyntaxError otherwise).
  const expectParses = (src: string) => {
    expect(() => new Function(src)).not.toThrow();
  };

  it('truncated mid-close-tag: the streamed/saved content excludes `</bo` and still parses', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    // A real callback-style file whose tail is the very thing that went missing (`});`).
    const body = [
      'function setup(app) {',
      '  app.listen(3000, () => {',
      "    console.log('ready');",
      '  });',
      '}',
      'setup(server);',
    ].join('\n');

    const head =
      '<boltArtifact title="Server" id="a1" type="bundled"><boltAction type="file" filePath="src/server.js">';

    /*
     * The model streamed the whole body, then began the close tag but was cut off
     * after `</bo`. The stream ENDS here — `onActionClose` never fires. Feed the
     * parser cumulative snapshots exactly as the runtime does.
     */
    const truncated = head + body + '\n</bo';

    for (let cut = head.length; cut <= truncated.length; cut += 5) {
      parser.parse('trunc', truncated.slice(0, cut));
    }
    parser.parse('trunc', truncated);

    /*
     * The close tag never completed, so no onActionClose — the streamed content IS
     * what a save-before-close would persist.
     */
    expect(callbacks.onActionClose).not.toHaveBeenCalled();

    const streamed = lastStreamedContent(callbacks);

    // The partial close tag must be held back — no `</bo`, no lone trailing `<`.
    expect(streamed).not.toContain('</bo');
    expect(streamed).not.toContain('</boltAction>');
    expect(streamed.endsWith('<')).toBe(false);

    // Everything the model actually emitted before the partial tag is preserved…
    expect(streamed).toContain("console.log('ready');");
    expect(streamed).toContain('});');
    expect(streamed).toContain('setup(server);');

    // …and the saved file is valid JavaScript, not a truncated fragment.
    expectParses(streamed);
  });

  it('harder case — long file + multi-byte UTF-8, close tag split across two chunks: byte-exact final content', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    // Longer file with multi-byte characters (accents, CJK, emoji) in string literals.
    const lines: string[] = [];
    lines.push('const messages = {');
    lines.push("  fr: 'Déploiement terminé — félicitations ✅',");
    lines.push("  jp: 'デプロイが完了しました 🚀',");
    lines.push("  emoji: '🌍🌎🌏',");

    for (let n = 0; n < 40; n++) {
      lines.push(`  item_${n}: 'valeur ${n} — café ☕',`);
    }

    lines.push('};');
    lines.push('function render(locale) {');
    lines.push('  return messages[locale] || messages.fr;');
    lines.push('}');
    lines.push("render('jp');");

    const body = lines.join('\n');
    const head = '<boltArtifact title="I18n" id="a1" type="bundled"><boltAction type="file" filePath="src/i18n.js">';
    const full = head + body + '</boltAction></boltArtifact>';

    /*
     * Split the close tag EXACTLY across two cumulative snapshots: the first ends
     * mid-tag at `</bo`, the second completes it.
     */
    const closeStart = head.length + body.length;
    const splitAt = closeStart + 4; // right after `</bo`

    const snapshots = [full.slice(0, splitAt), full];

    for (const snap of snapshots) {
      parser.parse('multibyte', snap);

      // No streamed payload may ever contain a partial close tag.
      for (const call of callbacks.onActionStream.mock.calls) {
        expect(call[0].action.content as string).not.toContain('</bo');
      }
    }

    /*
     * The close tag completed on the second snapshot → onActionClose fires once with
     * byte-exact content (multi-byte chars intact, no `</bo`, trailing '\n' added).
     */
    expect(callbacks.onActionClose).toHaveBeenCalledTimes(1);

    const finalContent = callbacks.onActionClose.mock.calls[0][0].action.content as string;

    expect(finalContent).toBe(body + '\n');
    expect(finalContent).not.toContain('</bo');
    expect(finalContent).toContain('Déploiement terminé — félicitations ✅');
    expect(finalContent).toContain('デプロイが完了しました 🚀');
    expect(finalContent).toContain('🌍🌎🌏');
    expect(finalContent).toContain('item_39');
    expectParses(finalContent);
  });

  it('a legitimate `</bo` in file content is NOT lost once the following bytes prove it is not the close tag', () => {
    const callbacks = mkCallbacks();
    const parser = new StreamingMessageParser({ callbacks });

    // The file content itself legitimately contains `</bo...>` (e.g. as a string).
    const body = "const marker = '</body>';\nconsole.log(marker);";
    const head = '<boltArtifact title="Edge" id="a1" type="bundled"><boltAction type="file" filePath="src/edge.js">';
    const full = head + body + '</boltAction></boltArtifact>';

    for (let cut = head.length; cut <= full.length; cut += 3) {
      parser.parse('legit', full.slice(0, cut));
    }
    parser.parse('legit', full);

    /*
     * Final content preserves the legit `</body>` verbatim — only the REAL close
     * tag is stripped.
     */
    const finalContent = callbacks.onActionClose.mock.calls[0][0].action.content as string;
    expect(finalContent).toBe(body + '\n');
    expect(finalContent).toContain("'</body>'");
    expect(finalContent).not.toContain('boltAction');
  });
});

function runTest(input: string | string[], outputOrExpectedResult: string | ExpectedResult) {
  let expected: ExpectedResult;

  if (typeof outputOrExpectedResult === 'string') {
    expected = { output: outputOrExpectedResult };
  } else {
    expected = outputOrExpectedResult;
  }

  const callbacks = {
    onArtifactOpen: vi.fn<ArtifactCallback>((data) => {
      expect(data).toMatchSnapshot('onArtifactOpen');
    }),
    onArtifactClose: vi.fn<ArtifactCallback>((data) => {
      expect(data).toMatchSnapshot('onArtifactClose');
    }),
    onActionOpen: vi.fn<ActionCallback>((data) => {
      expect(data).toMatchSnapshot('onActionOpen');
    }),
    onActionClose: vi.fn<ActionCallback>((data) => {
      expect(data).toMatchSnapshot('onActionClose');
    }),
  };

  const parser = new StreamingMessageParser({
    artifactElement: () => '',
    callbacks,
  });

  let message = '';

  let result = '';

  const chunks = Array.isArray(input) ? input : input.split('');

  for (const chunk of chunks) {
    message += chunk;

    result += parser.parse('message_1', message);
  }

  for (const name in expected.callbacks) {
    const callbackName = name;

    expect(callbacks[callbackName as keyof typeof callbacks]).toHaveBeenCalledTimes(
      expected.callbacks[callbackName as keyof typeof expected.callbacks] ?? 0,
    );
  }

  expect(result).toEqual(expected.output);
}
