import xlsx from "xlsx";
import readline from "readline";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import puppeteer from "puppeteer";
import fs from "fs";
import dotenv from "dotenv"
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

lerProdutosTxt();

function lerProdutosTxt() {
  const filePath = path.join(__dirname, process.env.NOME_ARQUIVO_TXT_PRODUTOS);

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });

  const rl = readline.createInterface({
    input: fileStream,
    output: process.stdout,
    terminal: false,
  });

  let contador = 0;
  let eans = [];

  rl.on("line", (line) => {
    if (contador < process.env.QUANTIDADE_PRODUTOS_TXT) {
      eans.push(line);
      contador++;
    } else {
      rl.close();
    }
  });

  rl.on("close", async () => {
    console.log("Download iniciado!");
    
    const produtosNaoEncontrados = [];
    for (const ean of eans) {
      const produto = await baixarImagem(ean);
      if (produto) {
        produtosNaoEncontrados.push(produto);
      }
      registrarLog(ean);
      await delay(process.env.DELAY * 1000);
    }

    if (produtosNaoEncontrados.length > 0) {
      console.log("Salvando produtos não encontrados!");
      salvarProdutoNaoEncontrado(produtosNaoEncontrados);
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function baixarImagem(ean) {
  const url = process.env.URL_COSMOS + ean;
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

    if (!fs.existsSync(process.env.NOME_PASTA_IMAGENS)) {
      fs.mkdirSync(process.env.NOME_PASTA_IMAGENS);
    }

    const imagePath = path.join(process.env.NOME_PASTA_IMAGENS, `${ean}.${process.env.EXTENSAO_IMAGEM}`);
    fs.writeFileSync(imagePath, imageBuffer);
  } catch (error) {
    console.error(`Erro ao baixar a imagem para o EAN ${ean}:`, error);
    return { ean, url, erro: error.message };
  } finally {
    await browser.close();
  }
}

function registrarLog(ean) {
  const filePath = path.join(__dirname, process.env.NOME_ARQUIVO_TXT_LOG);
  const fileStream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
  const logMessage = `[${formatDate()}] ${ean}\n`;
  fileStream.write(logMessage);
  fileStream.end();
}

function formatDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function salvarProdutoNaoEncontrado(produtos) {
  const ws = xlsx.utils.json_to_sheet(produtos);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Sheet1");

  const csv = xlsx.utils.sheet_to_csv(ws);

  fs.writeFileSync(process.env.NOME_CSV_PRODUTOS_NAO_ENCONTRADOS, csv);
  console.log("Finalizado!");
}
