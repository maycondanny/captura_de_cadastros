import xlsx from "xlsx";
import readline from "readline";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import puppeteer from "puppeteer";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPO = 2; // Tempo para executar em segundos
const QUANTIDADE_PRODUTOS = 100; // Quantidade de linhas no arquivo TXT
const PASTA_IMAGENS = "imagens"; // Nome da pasta que será salva as imagens
const NOME_ARQUIVO_PRODUTOS_NAO_ENCONTRADOS = "produtos_nao_encontrados.csv"; // Nome do arquivo CSV para produtos não encontrados

lerProdutosTxt();

function lerProdutosTxt() {
  const filePath = path.join(__dirname, "produtos.txt");

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });

  const rl = readline.createInterface({
    input: fileStream,
    output: process.stdout,
    terminal: false,
  });

  let contador = 0;
  let eans = [];

  rl.on("line", (line) => {
    if (contador < QUANTIDADE_PRODUTOS) {
      eans.push(line);
      contador++;
    } else {
      rl.close();
    }
  });

  rl.on("close", async () => {
    const produtosNaoEncontrados = [];
    for (const ean of eans) {
      const produto = await baixarImagem(ean);
      if (produto) {
        produtosNaoEncontrados.push(produto);
      }
      await delay(TEMPO * 1000);
    }

    if (produtosNaoEncontrados.length > 0) {
      salvarProdutoNaoEncontrado(produtosNaoEncontrados);
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function baixarImagem(ean) {
  const url = "https://cdn-cosmos.bluesoft.com.br/products/" + ean;
  const browser = await puppeteer.launch({ headless: true });

  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "domcontentloaded" });

    const imageSrc = await page.evaluate(() => {
      const img = document.querySelector("img");
      if (img && img.src) {
        return img.src;
      }
    });

    if (!imageSrc) {
      return { ean, url, erro: "404 Not Found" };
    }

    if (!imageSrc || !imageSrc.startsWith("http")) {
      throw new Error("URL da imagem inválida.");
    }

    const viewSource = await page.goto(imageSrc);
    const imageBuffer = await viewSource.buffer();

    if (!fs.existsSync(PASTA_IMAGENS)) {
      fs.mkdirSync(PASTA_IMAGENS);
    }

    const imagePath = path.join(PASTA_IMAGENS, `${ean}.jpg`);
    fs.writeFileSync(imagePath, imageBuffer);
  } catch (error) {
    console.error(`Erro ao baixar a imagem para o EAN ${ean}:`, error);
    return { ean, url, erro: error.message };
  } finally {
    await browser.close();
  }
}

function salvarProdutoNaoEncontrado(produtos) {
  const ws = xlsx.utils.json_to_sheet(produtos);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Sheet1");

  const csv = xlsx.utils.sheet_to_csv(ws);

  fs.writeFileSync(NOME_ARQUIVO_PRODUTOS_NAO_ENCONTRADOS, csv);
}
