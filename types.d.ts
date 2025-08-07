import "bklar";
import type { BuniSearch } from "./engine";

declare module "bklar" {
  interface State {
    collection?: BuniSearch;
  }
}
