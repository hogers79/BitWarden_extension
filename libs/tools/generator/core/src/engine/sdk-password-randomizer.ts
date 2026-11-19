import {
  PasswordManagerClient,
  PassphraseGeneratorRequest,
  PasswordGeneratorRequest,
} from "@bitwarden/sdk-internal";

import { EFFLongWordList } from "@bitwarden/common/platform/misc/wordlist";

import { Type } from "../metadata";
import {
  CredentialGenerator,
  GenerateRequest,
  GeneratedCredential,
  PassphraseGenerationOptions,
  PasswordGenerationOptions,
} from "../types";

/** Generation algorithms that produce randomized secrets by calling on functionality from the SDK */
export class SdkPasswordRandomizer
  implements
    CredentialGenerator<PassphraseGenerationOptions>,
    CredentialGenerator<PasswordGenerationOptions>
{
  /** Instantiates the password randomizer
   *  @param client lazy factory that resolves a fresh SDK client per call. Invoked on each
   *  `generate()` so that re-emissions from `SdkService.client$` (e.g. environment changes) are
   *  picked up instead of capturing a stale client; see {@link GeneratorDependencyProvider.sdk}.
   *  @param currentTime gets the current datetime in epoch time
   */
  constructor(
    private client: () => Promise<PasswordManagerClient>,
    private currentTime: () => number,
  ) {}

  generate(
    request: GenerateRequest,
    settings: PasswordGenerationOptions,
  ): Promise<GeneratedCredential>;
  generate(
    request: GenerateRequest,
    settings: PassphraseGenerationOptions,
  ): Promise<GeneratedCredential>;
  async generate(
    request: GenerateRequest,
    settings: PasswordGenerationOptions | PassphraseGenerationOptions,
  ) {
    const client = await this.client();

    if (isPasswordGenerationOptions(settings)) {
      const password = settings.memorable
        ? await generateMemorable(client)
        : await client.generator().password(convertPasswordRequest(settings));

      return new GeneratedCredential(
        password,
        Type.password,
        this.currentTime(),
        request.source,
        request.website,
      );
    } else if (isPassphraseGenerationOptions(settings)) {
      const passphrase = await client.generator().passphrase(convertPassphraseRequest(settings));

      return new GeneratedCredential(
        passphrase,
        Type.password,
        this.currentTime(),
        request.source,
        request.website,
      );
    }

    throw new Error("Invalid settings received by generator.");
  }
}

/** Fork patch: random secure integer in [0, max). Uses rejection sampling to avoid bias. */
function secureInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/** Fork patch: the EFF long list reduced to words of exactly four letters. */
const MEMORABLE_WORDS: string[] = EFFLongWordList.filter((w) => /^[a-z]{4}$/.test(w));

/**
 * Fork patch: word-1234-word-word-word, every word exactly four letters, with one of the four
 * words capitalised. Words, digits and the capital all come from the browser's secure random
 * source. Entropy: 4 x log2(467) + 2 + 4 x log2(10) = about 50.8 bits.
 */
async function generateMemorable(_client: PasswordManagerClient): Promise<string> {
  const words: string[] = [];
  for (let i = 0; i < 4; i++) {
    words.push(MEMORABLE_WORDS[secureInt(MEMORABLE_WORDS.length)]);
  }
  const capital = secureInt(4);
  words[capital] = words[capital].charAt(0).toUpperCase() + words[capital].slice(1);
  let digits = "";
  for (let i = 0; i < 4; i++) {
    digits += secureInt(10).toString();
  }
  return `${words[0]}-${digits}-${words[1]}-${words[2]}-${words[3]}`;
}

function convertPasswordRequest(settings: PasswordGenerationOptions): PasswordGeneratorRequest {
  return {
    lowercase: settings.lowercase!,
    uppercase: settings.uppercase!,
    numbers: settings.number!,
    special: settings.special!,
    length: settings.length!,
    avoidAmbiguous: !settings.ambiguous!,
    minLowercase: settings.minLowercase!,
    minUppercase: settings.minUppercase!,
    minNumber: settings.minNumber!,
    minSpecial: settings.minSpecial!,
  };
}

function convertPassphraseRequest(
  settings: PassphraseGenerationOptions,
): PassphraseGeneratorRequest {
  return {
    numWords: settings.numWords!,
    wordSeparator: settings.wordSeparator!,
    capitalize: settings.capitalize!,
    includeNumber: settings.includeNumber!,
  };
}

function isPasswordGenerationOptions(settings: any): settings is PasswordGenerationOptions {
  return "length" in (settings ?? {});
}

function isPassphraseGenerationOptions(settings: any): settings is PassphraseGenerationOptions {
  return "numWords" in (settings ?? {});
}
