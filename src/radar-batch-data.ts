import lote1 from "../imports/lote_01.json";
import lote2 from "../imports/lote_02.json";
import lote3 from "../imports/lote_03.json";
import lote4 from "../imports/lote_04.json";
import lote5 from "../imports/lote_05.json";
import lote6 from "../imports/lote_06.json";
export const RADAR_BATCH = [...lote1,...lote2,...lote3,...lote4,...lote5,...lote6] as Array<{radar:string;date:string;category_slug:string;source_url:string;text:string}>;
