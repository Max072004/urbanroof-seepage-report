declare module 'html2pdf' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: {
      type?: string;
      quality?: number;
    };
    html2canvas?: Record<string, any>;
    jsPDF?: {
      orientation?: string;
      unit?: string;
      format?: string;
    };
  }

  interface Html2Pdf {
    set(options: Html2PdfOptions): Html2Pdf;
    from(element: HTMLElement | string): Html2Pdf;
    save(): void;
    output(type: string): any;
  }

  function html2pdf(): Html2Pdf;

  export default html2pdf;
}
