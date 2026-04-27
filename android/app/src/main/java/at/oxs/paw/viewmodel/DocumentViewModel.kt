package at.oxs.paw.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import at.oxs.paw.model.*
import at.oxs.paw.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class DocumentViewModel(private val apiService: ApiService) : ViewModel() {
    private val _documents = MutableStateFlow<List<Document>>(emptyList())
    val documents: StateFlow<List<Document>> = _documents

    private val _selectedDocument = MutableStateFlow<Document?>(null)
    val selectedDocument: StateFlow<Document?> = _selectedDocument

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState

    fun loadDocument(id: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val document = apiService.getDocument(id)
                _selectedDocument.value = document
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load document")
            }
        }
    }

    fun updateDocument(id: String, docType: String?, extractedJson: String?) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = UpdateDocumentRequest(docType, extractedJson)
                apiService.updateDocument(id, request)
                loadDocument(id)
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to update document")
            }
        }
    }

    fun deleteDocument(id: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                apiService.deleteDocument(id)
                _documents.value = _documents.value.filter { it.id != id }
                _selectedDocument.value = null
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to delete document")
            }
        }
    }

    fun clearState() {
        _uiState.value = UiState.Idle
    }
}
