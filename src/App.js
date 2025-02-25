import React, { useState, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import Papa from 'papaparse';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';

const PdfFillerApp = () => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [completedPdf, setCompletedPdf] = useState(null);
  const [templatePdf, setTemplatePdf] = useState(null);
  const [processedCount, setProcessedCount] = useState(0);
  
  // Load the PDF template from the embedded base64 string
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        // Convert base64 to binary
        const binaryString = atob(pdfTemplateBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        setTemplatePdf(bytes.buffer);
      } catch (err) {
        setError("Failed to load embedded PDF template: " + err.message);
      }
    };
    
    loadTemplate();
  }, []);

  // Process the CSV data and fill PDF forms
  const processCsvData = async (csvData) => {
    setProcessing(true);
    setError(null);
    setCompletedPdf(null);
    setProcessedCount(0);
    
    try {
      if (!templatePdf) {
        throw new Error("PDF template not loaded. Please reload the page.");
      }
      
      // Create a new PDF document that will contain all pages
      const mergedPdf = await PDFDocument.create();
      
      // Process each row in the CSV
      for (const row of csvData) {
        // Fill the PDF form with data from this row
        const pdfBytes = await fillPdfForm(templatePdf, row);
        
        // Load the filled PDF document
        const filledPdf = await PDFDocument.load(pdfBytes);
        
        // Copy pages from the filled PDF to the merged PDF
        const copiedPages = await mergedPdf.copyPages(filledPdf, filledPdf.getPageIndices());
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });
        
        setProcessedCount((prev) => prev + 1);
      }
      
      // Save the merged PDF
      const mergedPdfBytes = await mergedPdf.save();
      setCompletedPdf(mergedPdfBytes);
    } catch (err) {
      console.error("Error processing CSV data:", err);
      setError(`Failed to process CSV data: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Fill a single PDF form with data from a CSV row
  const fillPdfForm = async (templateBytes, rowData) => {
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill in the form fields with data from the CSV
    try {
      // Map the field names from CSV to PDF form fields
      const fieldMappings = {
        'Client': 'Client',
        'Prosystems #': 'ProSystem\'s #',
        'Tax Year': 'Tax Year',
        'Return Type': 'Return Type',
        'File Directory': 'File Directory'
      };
      
      // Fill in each mapped field
      Object.entries(fieldMappings).forEach(([csvField, pdfField]) => {
        const value = rowData[csvField] || '';
        try {
          const formField = form.getTextField(pdfField);
          if (formField) {
            formField.setText(String(value));
          }
        } catch (fieldErr) {
          console.warn(`Could not fill field "${pdfField}": ${fieldErr.message}`);
        }
      });
      
      // Handle states separately (since they can be multiple)
      // Look for non-empty state columns (columns with 'States' in the header)
      const stateFields = Object.keys(rowData).filter(key => 
        key.includes('States') && rowData[key] && rowData[key].trim()
      );
      
      // Combine all state values into a single string
      const stateValues = stateFields.map(field => rowData[field]).filter(Boolean);
      const statesText = stateValues.join(', ');
      
      try {
        const statesField = form.getTextField('States');
        if (statesField) {
          statesField.setText(statesText);
        }
      } catch (stateErr) {
        console.warn(`Could not fill States field: ${stateErr.message}`);
      }
    } catch (err) {
      console.error("Error filling PDF form:", err);
      throw new Error(`Error filling PDF form: ${err.message}`);
    }

    // Flatten the form to prevent further editing
    form.flatten();
    
    // Serialize the PDF to bytes
    return await pdfDoc.save();
  };

  // Download the combined PDF file
  const downloadPdf = () => {
    if (!completedPdf) {
      setError("No completed PDF to download");
      return;
    }
    
    try {
      const blob = new Blob([completedPdf], { type: 'application/pdf' });
      saveAs(blob, 'tax-return-control-copies.pdf');
    } catch (err) {
      console.error("Error downloading file:", err);
      setError(`Failed to download file: ${err.message}`);
    }
  };

  // Set up dropzone for file upload
  const onDrop = useCallback(async (acceptedFiles) => {
    setError(null);
    
    if (acceptedFiles.length !== 1) {
      setError("Please upload exactly one CSV file");
      return;
    }
    
    const file = acceptedFiles[0];
    
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      setError("Please upload a CSV file");
      return;
    }
    
    try {
      // Read the file
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const csvText = e.target.result;
        
        // Parse the CSV
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
              setError(`Error parsing CSV: ${results.errors[0].message}`);
              return;
            }
            
            processCsvData(results.data);
          },
          error: (err) => {
            setError(`Error parsing CSV: ${err.message}`);
          }
        });
      };
      
      reader.onerror = () => {
        setError("Failed to read the file");
      };
      
      reader.readAsText(file);
    } catch (err) {
      console.error("Error handling file:", err);
      setError(`Failed to process file: ${err.message}`);
    }
  }, [processCsvData]); // Add processCsvData as a dependency

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    multiple: false
  });

  // Simple Card component for UI
  const Card = ({ children, className }) => <div className={className}>{children}</div>;
  const CardHeader = ({ children }) => <div>{children}</div>;
  const CardTitle = ({ children }) => <h2>{children}</h2>;
  const CardContent = ({ children }) => <div>{children}</div>;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-50 min-h-screen">
      <Card className="w-full max-w-3xl bg-white rounded-lg shadow-lg p-6">
        <CardHeader>
          <CardTitle className="text-2xl font-bold mb-6 text-center text-blue-800">
            Tax Return Control Copy Generator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            {...getRootProps()} 
            className={`border-2 border-dashed rounded-lg p-10 mb-6 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center">
              <svg className="h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path 
                  d="M24 8l-8 8h6v12h4V16h6l-8-8z" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
                <path 
                  d="M12 28v8h24v-8" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              </svg>
              <p className="text-lg font-medium">
                {isDragActive ? "Drop the CSV file here" : "Drag and drop a CSV file here, or click to select"}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                The CSV should contain client data similar to the example provided
              </p>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              <p>{error}</p>
            </div>
          )}
          
          {processing && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-gray-600">Processing your CSV data...</p>
            </div>
          )}
          
          {completedPdf && (
            <div className="text-center">
              <p className="text-green-600 text-lg mb-4">
                Successfully created a PDF with {processedCount} page{processedCount !== 1 ? 's' : ''}!
              </p>
              <button
                onClick={downloadPdf}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg shadow transition-colors"
              >
                Download PDF
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 text-sm text-gray-500 max-w-3xl">
        <h3 className="font-semibold mb-2">Instructions:</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Prepare your CSV file with columns for Client, Prosystems #, Tax Year, Return Type, States, and File Directory</li>
          <li>Drag and drop your CSV file into the upload area above</li>
          <li>Wait for processing to complete</li>
          <li>Click the download button to get your completed PDF form</li>
        </ol>
      </div>
    </div>
  );
};

export default PdfFillerApp;