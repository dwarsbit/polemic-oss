import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { activate } from "../src/index";
import { TranslatorProvider, useTranslator } from "../src/context";
import { rich, splitTags } from "../src/react";

afterEach(() => activate("en"));

describe("rich", () => {
  it("renders numbered tags with their parts", () => {
    const html = renderToStaticMarkup(
      <p>
        {rich("Press <0>Cmd+S</0> to save {file}.", [(c) => <kbd>{c}</kbd>], {
          file: "a.tex",
        })}
      </p>,
    );
    expect(html).toBe("<p>Press <kbd>Cmd+S</kbd> to save a.tex.</p>");
  });

  it("lets a translation move the tags", () => {
    activate("nl", {
      "Press <0>Cmd+S</0> to save.": "Druk op <0>Cmd+S</0> om op te slaan.",
    });
    const html = renderToStaticMarkup(
      <p>{rich("Press <0>Cmd+S</0> to save.", [(c) => <kbd>{c}</kbd>])}</p>,
    );
    expect(html).toBe("<p>Druk op <kbd>Cmd+S</kbd> om op te slaan.</p>");
  });

  it("splits text and tags", () => {
    expect(splitTags("a <0>b</0> c <1>d</1>")).toEqual([
      "a ",
      { tag: 0, text: "b" },
      " c ",
      { tag: 1, text: "d" },
    ]);
  });
});

describe("TranslatorProvider", () => {
  it("gives its subtree the language it was handed", () => {
    function Greeting() {
      const { t } = useTranslator();
      return <p>{t("Hello {name}", { name: "Ada" })}</p>;
    }
    const html = renderToStaticMarkup(
      <>
        <TranslatorProvider language="nl" catalog={{ "Hello {name}": "Hallo {name}" }}>
          <Greeting />
        </TranslatorProvider>
        <Greeting />
      </>,
    );
    expect(html).toBe("<p>Hallo Ada</p><p>Hello Ada</p>");
  });
});
